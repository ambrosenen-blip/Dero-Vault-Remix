/**
 * Dero Vault — Service Endpoints & Fail-Closed Configuration
 *
 * Mandatory Fail-Closed Endpoint Architecture:
 * - Permanent production endpoints have not yet been deployed.
 * - Inactive by default: all 3 services (UpdateManager, StabilityReporter, GlobalAdoptionMonitor)
 *   remain completely inactive for network communication until valid production endpoints
 *   are explicitly configured and pass strict security validation.
 * - Documentation placeholders are kept strictly isolated from the executable configuration.
 */

import { ServiceConfigState } from '../types.js';

// ============================================================================
// 1. Documentation-Only Placeholders (DO NOT USE IN NETWORK CLIENTS)
// ============================================================================
export const DERO_DOCUMENTATION_PLACEHOLDERS = {
  updateManifestUrl: 'https://YOUR-UPDATE-DOMAIN.example/dero-vault/stable/latest.json',
  stabilityReportUrl: 'https://YOUR-API-DOMAIN.example/dero-vault/v1/stability-reports',
  adoptionReportUrl: 'https://YOUR-API-DOMAIN.example/dero-vault/v1/adoption-reports',
  releaseChannel: 'stable',
  telemetryEnabledByDefault: false,
} as const;

// Known placeholder patterns that must never be contacted
export const PLACEHOLDER_PATTERNS = [
  'YOUR-UPDATE-DOMAIN',
  'YOUR-API-DOMAIN',
  '.example',
  'example.com',
  'example.org',
  'example.net',
  'placeholder',
  '<url>',
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
] as const;

// ============================================================================
// 2. Trusted Host Allowlists (Strictly Enforced in Production)
// ============================================================================
export const TRUSTED_UPDATE_HOSTS: readonly string[] = [
  'updates.derovault.com',
  'releases.derovault.com',
  'download.derovault.com',
  'raw.githubusercontent.com', // Official release manifests
  'github.com',
];

export const TRUSTED_REPORT_HOSTS: readonly string[] = [
  'telemetry.derovault.com',
  'stability.derovault.com',
  'adoption.derovault.com',
  'api.derovault.com',
];

// ============================================================================
// 3. Executable Production Configuration — Fail-Closed by Default
// ============================================================================
export interface DeroServiceConfig {
  /** Update manifest URL (null when unconfigured) */
  updateManifestUrl: string | null;
  /** Stability/crash telemetry report URL (null when unconfigured) */
  stabilityReportUrl: string | null;
  /** Anonymous global adoption heartbeat URL (null when unconfigured) */
  adoptionReportUrl: string | null;
  /** Active release channel */
  releaseChannel: 'stable' | 'beta';
  /** Default telemetry state (strictly false — opt-in only) */
  telemetryEnabledByDefault: boolean;
}

/**
 * Authoritative runtime configuration.
 * By default, all endpoint URLs are explicitly null, ensuring zero network calls
 * occur until explicitly activated via verified environment variables or deployment config.
 */
export const DERO_SERVICE_CONFIG: DeroServiceConfig = {
  updateManifestUrl: process.env.DERO_UPDATE_MANIFEST_URL || null,
  stabilityReportUrl: process.env.DERO_STABILITY_REPORT_URL || null,
  adoptionReportUrl: process.env.DERO_ADOPTION_REPORT_URL || null,
  releaseChannel: (process.env.DERO_RELEASE_CHANNEL as 'stable' | 'beta') || 'stable',
  telemetryEnabledByDefault: false,
};

// ============================================================================
// 4. Strict Production URL Validation
// ============================================================================
export interface EndpointValidationResult {
  state: ServiceConfigState;
  url: string | null;
  host: string | null;
  path: string | null;
  error?: string;
  isTrustedHost: boolean;
}

export interface ValidationOptions {
  allowLocalhostForTesting?: boolean;
  expectedPathPrefix?: string;
}

/**
 * Validates an endpoint URL strictly according to the fail-closed security policy:
 * - Requires HTTPS (rejects HTTP, file, ftp, and unknown schemes).
 * - Rejects empty, missing, placeholder, or example-domain strings.
 * - Rejects embedded credentials (e.g., https://user:pass@host).
 * - Validates hostname against the explicitly configured trusted-host allowlist.
 * - Rejects unexpected ports (standard 443 required).
 * - Does not infer readiness from syntactic validity alone.
 */
export function validateProductionEndpoint(
  rawUrl: string | null | undefined,
  trustedHosts: readonly string[],
  serviceName: string,
  options: ValidationOptions = {}
): EndpointValidationResult {
  // 1. Missing or unconfigured
  if (!rawUrl || typeof rawUrl !== 'string' || rawUrl.trim() === '') {
    return {
      state: 'UNCONFIGURED',
      url: null,
      host: null,
      path: null,
      isTrustedHost: false,
      error: `${serviceName} endpoint is not configured.`,
    };
  }

  const trimmed = rawUrl.trim();

  // 2. Reject known placeholder strings and example domains
  for (const placeholder of PLACEHOLDER_PATTERNS) {
    if (trimmed.toLowerCase().includes(placeholder.toLowerCase())) {
      // Allow localhost ONLY if explicitly enabled in local test harness
      if (options.allowLocalhostForTesting && (placeholder === 'localhost' || placeholder === '127.0.0.1')) {
        continue;
      }
      return {
        state: 'INVALID_CONFIGURATION',
        url: null,
        host: null,
        path: null,
        isTrustedHost: false,
        error: `Placeholder or example domain rejected for ${serviceName}.`,
      };
    }
  }

  // 3. Strict URL Parsing
  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch (err: any) {
    return {
      state: 'INVALID_CONFIGURATION',
      url: null,
      host: null,
      path: null,
      isTrustedHost: false,
      error: `Malformed URL for ${serviceName}: ${err.message}`,
    };
  }

  // 4. Scheme validation (strictly HTTPS)
  if (parsed.protocol !== 'https:') {
    if (!(options.allowLocalhostForTesting && parsed.protocol === 'http:')) {
      return {
        state: 'INVALID_CONFIGURATION',
        url: null,
        host: parsed.hostname,
        path: parsed.pathname,
        isTrustedHost: false,
        error: `Insecure scheme "${parsed.protocol}" rejected for ${serviceName}. HTTPS is strictly required.`,
      };
    }
  }

  // 5. Embedded credentials check (e.g. user:pass@host)
  if (parsed.username || parsed.password) {
    return {
      state: 'INVALID_CONFIGURATION',
      url: null,
      host: parsed.hostname,
      path: parsed.pathname,
      isTrustedHost: false,
      error: `Embedded credentials are not permitted in ${serviceName} endpoint.`,
    };
  }

  // 6. Hostname allowlist check
  const host = parsed.hostname.toLowerCase();
  const isTrusted = trustedHosts.some((trusted) => {
    const t = trusted.toLowerCase();
    return host === t || host.endsWith(`.${t}`);
  }) || (Boolean(options.allowLocalhostForTesting) && (host === 'localhost' || host === '127.0.0.1'));

  if (!isTrusted) {
    return {
      state: 'INVALID_CONFIGURATION',
      url: null,
      host,
      path: parsed.pathname,
      isTrustedHost: false,
      error: `Hostname "${host}" is not in the trusted allowlist for ${serviceName}.`,
    };
  }

  // 7. Port validation (must be 443 for HTTPS or standard 80 in local testing)
  if (parsed.port && parsed.port !== '443') {
    if (!(options.allowLocalhostForTesting && (parsed.port === '3000' || parsed.port === '8080' || parsed.port === '80'))) {
      return {
        state: 'INVALID_CONFIGURATION',
        url: null,
        host,
        path: parsed.pathname,
        isTrustedHost: false,
        error: `Non-standard port "${parsed.port}" rejected for ${serviceName}. Standard HTTPS (443) is required.`,
      };
    }
  }

  // 8. Expected path prefix check (if configured)
  if (options.expectedPathPrefix && !parsed.pathname.startsWith(options.expectedPathPrefix)) {
    return {
      state: 'INVALID_CONFIGURATION',
      url: null,
      host,
      path: parsed.pathname,
      isTrustedHost: true,
      error: `Expected path prefix "${options.expectedPathPrefix}" missing from ${serviceName} endpoint.`,
    };
  }

  // Valid, explicitly configured production endpoint
  return {
    state: 'READY',
    url: parsed.toString(),
    host,
    path: parsed.pathname,
    isTrustedHost: true,
  };
}
