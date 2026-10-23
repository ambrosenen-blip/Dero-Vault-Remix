/**
 * Dero Vault — GlobalAdoptionMonitor
 *
 * Tracks coarse, strictly anonymous workstation adoption metrics.
 * Operates strictly fail-closed: remains completely inactive when unconfigured.
 * Zero network requests occur when adoptionReportUrl is null or invalid.
 * Respects user telemetry consent strictly (opt-in only, defaults to disabled).
 * Strictly forbids fabricated numbers or mock live counters.
 */

import https from 'https';
import http from 'http';
import crypto from 'crypto';
import os from 'os';
import {
  DERO_SERVICE_CONFIG,
  TRUSTED_REPORT_HOSTS,
  validateProductionEndpoint,
  EndpointValidationResult,
} from '../config/serviceEndpoints.js';
import { ServiceConfigState, AdoptionMonitorStatus } from '../types.js';
import { LocalDatabase } from './localDb.js';

export interface HttpPostFunction {
  (url: string, payload: any): Promise<{ statusCode: number; data: string }>;
}

export class GlobalAdoptionMonitor {
  private db: LocalDatabase;
  private endpointUrl: string | null;
  private validationResult: EndpointValidationResult;
  private installationId: string;
  private lastHeartbeatAt: string | null = null;
  private totalHeartbeatsSent = 0;
  private httpPoster: HttpPostFunction;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private warnedUnconfigured = false;

  constructor(
    db: LocalDatabase,
    options?: {
      endpointUrl?: string | null;
      httpPoster?: HttpPostFunction;
      allowLocalhostForTesting?: boolean;
    }
  ) {
    this.db = db;
    this.endpointUrl = options?.endpointUrl !== undefined ? options.endpointUrl : DERO_SERVICE_CONFIG.adoptionReportUrl;
    this.httpPoster = options?.httpPoster || this.defaultHttpPost.bind(this);
    this.installationId = this.getOrCreateAnonymousInstallationId();

    this.validationResult = validateProductionEndpoint(
      this.endpointUrl,
      TRUSTED_REPORT_HOSTS,
      'GlobalAdoptionMonitor',
      { allowLocalhostForTesting: options?.allowLocalhostForTesting }
    );

    // Lifecycle enforcement: only schedule interval if the service is READY
    if (this.validationResult.state === 'READY') {
      this.schedulePeriodicHeartbeat();
    }
  }

  public getConfigState(): ServiceConfigState {
    return this.validationResult.state;
  }

  public getStatus(): AdoptionMonitorStatus {
    const state = this.validationResult.state;
    const adoptionConsent = this.db.getAdoptionConsent();
    let statusMessage = 'Global statistics are unavailable until reporting is configured.';

    if (state === 'INVALID_CONFIGURATION') {
      statusMessage = `Adoption reporting configuration is invalid: ${this.validationResult.error || 'rejected endpoint'}`;
    } else if (state === 'READY') {
      if (!adoptionConsent) {
        statusMessage = 'Global statistics reporting is ready but disabled by user privacy preference.';
      } else {
        statusMessage = this.lastHeartbeatAt
          ? `Adoption monitor active. Last report: ${new Date(this.lastHeartbeatAt).toLocaleDateString()}`
          : 'Adoption monitor is ready.';
      }
    }

    return {
      state,
      telemetryConsent: adoptionConsent,
      installationId: this.installationId,
      lastHeartbeatAt: this.lastHeartbeatAt,
      totalHeartbeatsSent: this.totalHeartbeatsSent,
      statusMessage,
      endpointUrl: this.validationResult.url,
    };
  }

  /**
   * Transmits an anonymous adoption heartbeat.
   * STRICT FAIL-CLOSED GUARANTEE:
   * If configState is not READY, or if user telemetry consent is false:
   * performs ZERO HTTP requests and never attempts network transmission.
   */
  public async sendHeartbeat(): Promise<{
    success: boolean;
    message: string;
  }> {
    // 1. Enforce fail-closed state
    if (this.validationResult.state !== 'READY') {
      if (!this.warnedUnconfigured) {
        console.log(`[AdoptionMonitor] Heartbeat ignored: Global statistics are unavailable until reporting is configured.`);
        this.warnedUnconfigured = true;
      }
      return {
        success: false,
        message: 'Global statistics are unavailable until reporting is configured.',
      };
    }

    // 2. Enforce user telemetry consent
    const consent = this.db.getAdoptionConsent();
    if (!consent) {
      return {
        success: false,
        message: 'Adoption reporting is disabled by user privacy preference (no consent).',
      };
    }

    const targetUrl = this.validationResult.url;
    if (!targetUrl) {
      return {
        success: false,
        message: 'Global statistics are unavailable until reporting is configured.',
      };
    }

    // Prepare strictly coarse, anonymous adoption payload
    const registeredDrives = this.db.getRegisteredDrives();
    const totalCapacityBytes = registeredDrives.reduce((acc, d) => acc + (d.totalBytes || 0), 0);
    const capacityTier =
      totalCapacityBytes > 500 * 1024 * 1024 * 1024
        ? '>500GB'
        : totalCapacityBytes > 100 * 1024 * 1024 * 1024
        ? '100-500GB'
        : totalCapacityBytes > 32 * 1024 * 1024 * 1024
        ? '32-100GB'
        : totalCapacityBytes > 0
        ? '<32GB'
        : 'none';

    const payload = {
      installationId: this.installationId,
      appVersion: '1.0.0',
      osPlatform: process.platform,
      osReleaseMajor: os.release().split('.')[0] || 'unknown',
      osArch: process.arch,
      registeredDriveCount: registeredDrives.length,
      storageTier: capacityTier,
      timestamp: new Date().toISOString(),
    };

    try {
      console.log(`[AdoptionMonitor] Transmitting anonymous adoption heartbeat to ${targetUrl}`);
      const res = await this.httpPoster(targetUrl, payload);

      if (res.statusCode >= 200 && res.statusCode < 300) {
        this.lastHeartbeatAt = new Date().toISOString();
        this.totalHeartbeatsSent += 1;
        return {
          success: true,
          message: 'Anonymous adoption heartbeat acknowledged by server.',
        };
      } else {
        throw new Error(`Server returned HTTP ${res.statusCode}`);
      }
    } catch (err: any) {
      console.warn(`[AdoptionMonitor] Heartbeat transmission error: ${err.message}`);
      return {
        success: false,
        message: `Failed to deliver heartbeat: ${err.message}`,
      };
    }
  }

  public updateConfig(newUrl: string | null): EndpointValidationResult {
    this.endpointUrl = newUrl;
    this.warnedUnconfigured = false;
    this.validationResult = validateProductionEndpoint(this.endpointUrl, TRUSTED_REPORT_HOSTS, 'GlobalAdoptionMonitor');

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.validationResult.state === 'READY') {
      this.schedulePeriodicHeartbeat();
    }

    return this.validationResult;
  }

  public destroy(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private schedulePeriodicHeartbeat(): void {
    if (this.heartbeatTimer) return;
    // Bounded weekly heartbeat; only active when READY
    this.heartbeatTimer = setInterval(() => {
      this.sendHeartbeat().catch(() => {});
    }, 7 * 24 * 60 * 60 * 1000);
  }

  private getOrCreateAnonymousInstallationId(): string {
    // Generate a pseudorandom anonymous client identifier salted with local machine directory
    try {
      const dataDir = this.db.getDataDirPath();
      const hash = crypto.createHash('sha256').update(`dero-vault-adoption-${dataDir}`).digest('hex');
      return `anon_${hash.substring(0, 16)}`;
    } catch {
      return `anon_${Date.now().toString(36)}`;
    }
  }

  private defaultHttpPost(targetUrl: string, payload: any): Promise<{ statusCode: number; data: string }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;
      const jsonBody = JSON.stringify(payload);

      const req = transport.request(
        targetUrl,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(jsonBody),
            'User-Agent': `DeroVault/1.0.0 (${process.platform}; ${process.arch})`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => { body += chunk; });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 200,
              data: body,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Adoption heartbeat network timeout (10s).'));
      });
      req.on('error', (err) => reject(err));
      req.write(jsonBody);
      req.end();
    });
  }
}
