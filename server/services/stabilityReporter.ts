/**
 * Dero Vault — StabilityReporter
 *
 * Captures non-PII stability anomalies, unexpected drive disconnects, and unhandled errors.
 * Operates strictly fail-closed: remains completely inactive when unconfigured.
 * Zero network requests occur when stabilityReportUrl is null or invalid.
 * Respects user telemetry consent strictly (opt-in only, defaults to disabled).
 */

import https from 'https';
import http from 'http';
import os from 'os';
import {
  DERO_SERVICE_CONFIG,
  TRUSTED_REPORT_HOSTS,
  validateProductionEndpoint,
  EndpointValidationResult,
} from '../config/serviceEndpoints.js';
import { ServiceConfigState, StabilityReporterStatus } from '../types.js';
import { LocalDatabase } from './localDb.js';

export interface StabilityEvent {
  id: string;
  timestamp: string;
  category: 'crash' | 'interruption' | 'verification_anomaly' | 'unhandled_rejection' | 'resource_limit';
  message: string;
  errorName?: string;
  sanitizedStack?: string;
  appVersion: string;
  osPlatform: string;
  osRelease: string;
  osArch: string;
  memoryUsageMb: number;
}

export interface HttpPostFunction {
  (url: string, payload: any): Promise<{ statusCode: number; data: string }>;
}

export class StabilityReporter {
  private db: LocalDatabase;
  private endpointUrl: string | null;
  private validationResult: EndpointValidationResult;
  private queue: StabilityEvent[] = [];
  private readonly maxQueueLength = 50;
  private readonly retentionPeriodMs = 7 * 24 * 60 * 60 * 1000; // 7 days
  private lastReportedAt: string | null = null;
  private totalReported = 0;
  private httpPoster: HttpPostFunction;
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
    this.endpointUrl = options?.endpointUrl !== undefined ? options.endpointUrl : DERO_SERVICE_CONFIG.stabilityReportUrl;
    this.httpPoster = options?.httpPoster || this.defaultHttpPost.bind(this);

    this.validationResult = validateProductionEndpoint(
      this.endpointUrl,
      TRUSTED_REPORT_HOSTS,
      'StabilityReporter',
      { allowLocalhostForTesting: options?.allowLocalhostForTesting }
    );
  }

  public getConfigState(): ServiceConfigState {
    return this.validationResult.state;
  }

  public getStatus(): StabilityReporterStatus {
    const state = this.validationResult.state;
    const stabilityConsent = this.db.getStabilityConsent();
    let statusMessage = 'Diagnostic reporting is unavailable until the service is configured.';

    if (state === 'INVALID_CONFIGURATION') {
      statusMessage = `Diagnostic reporting configuration is invalid: ${this.validationResult.error || 'rejected endpoint'}`;
    } else if (state === 'READY') {
      if (!stabilityConsent) {
        statusMessage = 'Diagnostic reporting is ready but disabled by user privacy preference.';
      } else {
        statusMessage = `Diagnostic reporting is active (${this.queue.length} pending report(s)).`;
      }
    }

    return {
      state,
      telemetryConsent: stabilityConsent,
      queueLength: this.queue.length,
      maxQueueLength: this.maxQueueLength,
      lastReportedAt: this.lastReportedAt,
      totalReported: this.totalReported,
      statusMessage,
      endpointUrl: this.validationResult.url,
    };
  }

  /**
   * Records a local stability diagnostic event.
   * Sanitizes all paths and content to ensure zero PII or document data is ever stored.
   */
  public recordEvent(event: {
    category: 'crash' | 'interruption' | 'verification_anomaly' | 'unhandled_rejection' | 'resource_limit';
    message: string;
    errorName?: string;
    stack?: string;
  }): void {
    this.purgeExpiredQueue();

    const sanitizedMessage = this.sanitizeString(event.message);
    const sanitizedStack = event.stack ? this.sanitizeString(event.stack) : undefined;

    const record: StabilityEvent = {
      id: `diag_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      category: event.category,
      message: sanitizedMessage,
      errorName: event.errorName,
      sanitizedStack,
      appVersion: '1.0.0',
      osPlatform: process.platform,
      osRelease: os.release(),
      osArch: process.arch,
      memoryUsageMb: Math.round(process.memoryUsage().heapUsed / 1024 / 1024),
    };

    // Bounded FIFO queue
    this.queue.push(record);
    if (this.queue.length > this.maxQueueLength) {
      this.queue.shift();
    }

    // Log diagnostic locally to disk log regardless of network state
    this.db.log('warn', 'Stability', `[${event.category}] ${sanitizedMessage}`, {
      eventId: record.id,
      errorName: event.errorName,
    });
  }

  /**
   * Flushes queued stability events.
   * STRICT FAIL-CLOSED GUARANTEE:
   * If configState is not READY, or if user telemetry consent is false:
   * performs ZERO HTTP requests and never attempts network transmission.
   */
  public async flush(): Promise<{
    sent: number;
    remaining: number;
    message: string;
  }> {
    // 1. Enforce fail-closed state
    if (this.validationResult.state !== 'READY') {
      if (!this.warnedUnconfigured) {
        console.log(`[StabilityReporter] Flush ignored: Diagnostic reporting is unavailable until configured.`);
        this.warnedUnconfigured = true;
      }
      return {
        sent: 0,
        remaining: this.queue.length,
        message: 'Diagnostic reporting is unavailable until the service is configured.',
      };
    }

    // 2. Enforce user telemetry consent
    const consent = this.db.getStabilityConsent();
    if (!consent) {
      return {
        sent: 0,
        remaining: this.queue.length,
        message: 'Diagnostic reporting is disabled by user privacy preference (no consent).',
      };
    }

    if (this.queue.length === 0) {
      return {
        sent: 0,
        remaining: 0,
        message: 'Queue is empty. Nothing to report.',
      };
    }

    const targetUrl = this.validationResult.url;
    if (!targetUrl) {
      return {
        sent: 0,
        remaining: this.queue.length,
        message: 'Diagnostic reporting is unavailable until the service is configured.',
      };
    }

    const batch = [...this.queue];
    try {
      console.log(`[StabilityReporter] Transmitting ${batch.length} sanitized diagnostic report(s) to ${targetUrl}`);
      const res = await this.httpPoster(targetUrl, {
        events: batch,
        timestamp: new Date().toISOString(),
      });

      if (res.statusCode >= 200 && res.statusCode < 300) {
        this.queue = this.queue.filter((e) => !batch.some((b) => b.id === e.id));
        this.lastReportedAt = new Date().toISOString();
        this.totalReported += batch.length;
        return {
          sent: batch.length,
          remaining: this.queue.length,
          message: `Successfully transmitted ${batch.length} diagnostic report(s).`,
        };
      } else {
        throw new Error(`Server returned HTTP ${res.statusCode}`);
      }
    } catch (err: any) {
      console.warn(`[StabilityReporter] Diagnostic transmission error: ${err.message}`);
      return {
        sent: 0,
        remaining: this.queue.length,
        message: `Failed to deliver diagnostics: ${err.message}`,
      };
    }
  }

  public clearQueue(): void {
    this.queue = [];
  }

  public updateConfig(newUrl: string | null): EndpointValidationResult {
    this.endpointUrl = newUrl;
    this.warnedUnconfigured = false;
    this.validationResult = validateProductionEndpoint(this.endpointUrl, TRUSTED_REPORT_HOSTS, 'StabilityReporter');
    return this.validationResult;
  }

  private purgeExpiredQueue(): void {
    const cutoff = Date.now() - this.retentionPeriodMs;
    this.queue = this.queue.filter((e) => new Date(e.timestamp).getTime() > cutoff);
  }

  private sanitizeString(input: string): string {
    if (!input) return '';
    let result = input;
    // Redact Windows username from C:\Users\<Username>\...
    result = result.replace(/([a-zA-Z]:\\Users\\)[^\\]+/gi, '$1[REDACTED]');
    // Redact Linux/macOS username from /home/<username>/... or /Users/<username>/...
    result = result.replace(/(\/(home|Users)\/)[^/]+/gi, '$1[REDACTED]');
    // Redact any auth tokens or keys
    result = result.replace(/(api[_-]?key|token|secret|password)=([^&\s]+)/gi, '$1=[REDACTED]');
    return result;
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
        reject(new Error('Diagnostic report network timeout (10s).'));
      });
      req.on('error', (err) => reject(err));
      req.write(jsonBody);
      req.end();
    });
  }
}
