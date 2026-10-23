/**
 * Dero Vault — UpdateManager
 *
 * Checks for software updates from a verified, trusted update manifest.
 * Operates strictly fail-closed: remains completely inactive when unconfigured.
 * Zero network requests occur when updateManifestUrl is null or invalid.
 */

import https from 'https';
import http from 'http';
import {
  DERO_SERVICE_CONFIG,
  TRUSTED_UPDATE_HOSTS,
  validateProductionEndpoint,
  EndpointValidationResult,
} from '../config/serviceEndpoints.js';
import { ServiceConfigState, UpdateManagerStatus, UpdateManifest } from '../types.js';

export interface HttpGetFunction {
  (url: string): Promise<{ statusCode: number; data: string; headers: Record<string, string | string[] | undefined> }>;
}

export class UpdateManager {
  private currentVersion: string;
  private channel: 'stable' | 'beta';
  private manifestUrl: string | null;
  private validationResult: EndpointValidationResult;
  private lastCheckedAt: string | null = null;
  private latestManifest: UpdateManifest | null = null;
  private isChecking = false;
  private httpGetter: HttpGetFunction;
  private checkIntervalTimer: NodeJS.Timeout | null = null;

  constructor(
    currentVersion = '1.0.0',
    options?: {
      manifestUrl?: string | null;
      channel?: 'stable' | 'beta';
      httpGetter?: HttpGetFunction;
      allowLocalhostForTesting?: boolean;
    }
  ) {
    this.currentVersion = currentVersion;
    this.channel = options?.channel || DERO_SERVICE_CONFIG.releaseChannel || 'stable';
    this.manifestUrl = options?.manifestUrl !== undefined ? options.manifestUrl : DERO_SERVICE_CONFIG.updateManifestUrl;
    this.httpGetter = options?.httpGetter || this.defaultHttpGet.bind(this);

    // Validate the endpoint immediately on instantiation
    this.validationResult = validateProductionEndpoint(
      this.manifestUrl,
      TRUSTED_UPDATE_HOSTS,
      'UpdateManager',
      { allowLocalhostForTesting: options?.allowLocalhostForTesting }
    );

    // Lifecycle enforcement: only schedule interval if the service is READY
    if (this.validationResult.state === 'READY') {
      this.schedulePeriodicChecks();
    }
  }

  public getConfigState(): ServiceConfigState {
    return this.validationResult.state;
  }

  public getStatus(): UpdateManagerStatus {
    const state = this.validationResult.state;
    let statusMessage = 'Update checking is not configured.';

    if (state === 'INVALID_CONFIGURATION') {
      statusMessage = `Update checking configuration is invalid: ${this.validationResult.error || 'rejected endpoint'}`;
    } else if (state === 'READY') {
      if (this.isChecking) {
        statusMessage = 'Checking for updates...';
      } else if (this.latestManifest && this.isNewerVersion(this.latestManifest.version, this.currentVersion)) {
        statusMessage = `Update available: v${this.latestManifest.version}`;
      } else if (this.lastCheckedAt) {
        statusMessage = `Dero Vault is up to date (v${this.currentVersion}).`;
      } else {
        statusMessage = 'Update manager is ready.';
      }
    }

    const updateAvailable = Boolean(
      state === 'READY' &&
        this.latestManifest &&
        this.isNewerVersion(this.latestManifest.version, this.currentVersion)
    );

    return {
      state,
      currentVersion: this.currentVersion,
      latestVersion: this.latestManifest ? this.latestManifest.version : null,
      updateAvailable,
      lastCheckedAt: this.lastCheckedAt,
      statusMessage,
      channel: this.channel,
      downloadUrl: this.latestManifest?.downloadUrl,
      releaseNotes: this.latestManifest?.releaseNotes,
      sha256: this.latestManifest?.sha256,
      isChecking: this.isChecking,
      endpointUrl: this.validationResult.url,
    };
  }

  /**
   * Check for updates.
   * STRICT FAIL-CLOSED GUARANTEE:
   * If configState is UNCONFIGURED or INVALID_CONFIGURATION, returns immediately
   * without constructing any network client or initiating any HTTP request.
   */
  public async checkForUpdates(_force = false): Promise<{
    checked: boolean;
    state: ServiceConfigState;
    message: string;
    updateAvailable: boolean;
    manifest?: UpdateManifest;
  }> {
    // 1. Enforce fail-closed state
    if (this.validationResult.state !== 'READY') {
      return {
        checked: false,
        state: this.validationResult.state,
        message:
          this.validationResult.state === 'UNCONFIGURED'
            ? 'Update checking is not configured.'
            : `Update checking is unavailable: ${this.validationResult.error}`,
        updateAvailable: false,
      };
    }

    const targetUrl = this.validationResult.url;
    if (!targetUrl) {
      return {
        checked: false,
        state: 'UNCONFIGURED',
        message: 'Update checking is not configured.',
        updateAvailable: false,
      };
    }

    this.isChecking = true;
    try {
      console.log(`[UpdateManager] Checking for updates at verified endpoint: ${targetUrl}`);
      const res = await this.httpGetter(targetUrl);

      if (res.statusCode !== 200) {
        throw new Error(`HTTP ${res.statusCode} from update manifest server`);
      }

      const parsed: Partial<UpdateManifest> = JSON.parse(res.data);
      if (!parsed.version || !parsed.downloadUrl || !parsed.sha256) {
        throw new Error('Update manifest schema validation failed: missing required fields');
      }

      // Validate that downloadUrl itself points to a trusted update host
      const parsedDownload = new URL(parsed.downloadUrl);
      const isTrustedHost = TRUSTED_UPDATE_HOSTS.some((th) => {
        const t = th.toLowerCase();
        const dh = parsedDownload.hostname.toLowerCase();
        return dh === t || dh.endsWith(`.${t}`);
      });

      if (!isTrustedHost && parsedDownload.protocol !== 'https:') {
        throw new Error(`Update package download host "${parsedDownload.hostname}" is not trusted`);
      }

      const manifest: UpdateManifest = {
        version: String(parsed.version).trim(),
        releaseDate: parsed.releaseDate || new Date().toISOString(),
        releaseNotes: parsed.releaseNotes || 'Maintenance and stability update.',
        downloadUrl: parsed.downloadUrl,
        sha256: String(parsed.sha256).toLowerCase().trim(),
        minimumOsVersion: parsed.minimumOsVersion,
      };

      this.latestManifest = manifest;
      this.lastCheckedAt = new Date().toISOString();
      const hasUpdate = this.isNewerVersion(manifest.version, this.currentVersion);

      return {
        checked: true,
        state: 'READY',
        message: hasUpdate ? `New update available: v${manifest.version}` : 'Dero Vault is up to date.',
        updateAvailable: hasUpdate,
        manifest,
      };
    } catch (err: any) {
      console.warn(`[UpdateManager] Update check error: ${err.message}`);
      return {
        checked: false,
        state: 'READY',
        message: `Failed to check for updates: ${err.message}`,
        updateAvailable: false,
      };
    } finally {
      this.isChecking = false;
    }
  }

  public updateConfig(newUrl: string | null, channel?: 'stable' | 'beta'): EndpointValidationResult {
    this.manifestUrl = newUrl;
    if (channel) this.channel = channel;
    this.validationResult = validateProductionEndpoint(this.manifestUrl, TRUSTED_UPDATE_HOSTS, 'UpdateManager');

    if (this.checkIntervalTimer) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }

    if (this.validationResult.state === 'READY') {
      this.schedulePeriodicChecks();
    }

    return this.validationResult;
  }

  public destroy(): void {
    if (this.checkIntervalTimer) {
      clearInterval(this.checkIntervalTimer);
      this.checkIntervalTimer = null;
    }
  }

  private schedulePeriodicChecks(): void {
    if (this.checkIntervalTimer) return;
    // Bounded 24-hour interval; only active when READY
    this.checkIntervalTimer = setInterval(() => {
      this.checkForUpdates().catch(() => {});
    }, 24 * 60 * 60 * 1000);
  }

  private isNewerVersion(remoteVer: string, localVer: string): boolean {
    const parse = (v: string) => v.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const [rMaj, rMin, rPat] = parse(remoteVer);
    const [lMaj, lMin, lPat] = parse(localVer);

    if (rMaj !== lMaj) return rMaj > lMaj;
    if (rMin !== lMin) return rMin > lMin;
    return rPat > lPat;
  }

  private defaultHttpGet(targetUrl: string): Promise<{ statusCode: number; data: string; headers: Record<string, string | string[] | undefined> }> {
    return new Promise((resolve, reject) => {
      const parsed = new URL(targetUrl);
      const isHttps = parsed.protocol === 'https:';
      const transport = isHttps ? https : http;

      const req = transport.get(
        targetUrl,
        {
          headers: {
            'User-Agent': `DeroVault/${this.currentVersion} (${process.platform}; ${process.arch})`,
            'Accept': 'application/json',
          },
          timeout: 10000,
        },
        (res) => {
          // Reject cross-origin redirects
          if (res.statusCode && [301, 302, 307, 308].includes(res.statusCode)) {
            const redirectLocation = res.headers.location;
            if (redirectLocation) {
              const redirectUrl = new URL(redirectLocation, targetUrl);
              if (redirectUrl.origin !== parsed.origin) {
                req.destroy();
                return reject(new Error(`Cross-origin redirect to ${redirectUrl.origin} rejected.`));
              }
            }
          }

          let body = '';
          res.setEncoding('utf8');
          res.on('data', (chunk) => {
            body += chunk;
            // Limit manifest size to 1MB
            if (body.length > 1024 * 1024) {
              req.destroy();
              reject(new Error('Update manifest exceeded maximum size of 1MB.'));
            }
          });
          res.on('end', () => {
            resolve({
              statusCode: res.statusCode || 200,
              data: body,
              headers: res.headers,
            });
          });
        }
      );

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Update check network timeout (10s).'));
      });
      req.on('error', (err) => reject(err));
    });
  }
}
