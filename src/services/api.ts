/**
 * Dero Vault — API Client & Event Source
 */

import {
  AppLogEntry,
  AppSettings,
  BackupProfile,
  BackupReminderSettings,
  BackupSession,
  PlatformInfo,
  ReminderNotificationData,
  ReminderStatus,
  RemovableDrive,
  SourceFolderOption,
  StartupStatus,
  AllServicesStatus,
  UpdateManagerStatus,
  StabilityReporterStatus,
  AdoptionMonitorStatus,
  ServiceConfigState,
  UpdateManifest,
  LegalAcceptance,
} from '../types';

const getApiBaseUrl = (): string => {
  if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000';
  }
  return '';
};

export class ApiClient {
  private static eventSource: EventSource | null = null;

  private static async safeFetchJson<T>(url: string, init?: RequestInit): Promise<T> {
    const fullUrl = url.startsWith('http') ? url : `${getApiBaseUrl()}${url}`;
    const res = await fetch(fullUrl, init);
    const contentType = res.headers.get('content-type') || '';
    if (!res.ok) {
      if (contentType.includes('application/json')) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      throw new Error(`HTTP ${res.status}`);
    }
    if (!contentType.includes('application/json')) {
      throw new Error(`Expected JSON from ${fullUrl}, received: ${contentType}`);
    }
    return res.json();
  }

  public static async getDrives(): Promise<{ drives: RemovableDrive[]; registered: RemovableDrive[]; profiles?: BackupProfile[] }> {
    return this.safeFetchJson('/api/drives');
  }

  public static async getProfiles(): Promise<{ profiles: BackupProfile[] }> {
    return this.safeFetchJson('/api/profiles');
  }

  public static async registerDrive(data: {
    stableHardwareId: string;
    friendlyName: string;
    sourceFolders: string[];
    autoBackupEnabled?: boolean;
    verifyBackups?: boolean;
    preserveVersions?: boolean;
  }): Promise<{ success: boolean; drive: RemovableDrive; profile: BackupProfile }> {
    return this.safeFetchJson('/api/drives/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  public static async updateDrive(
    stableId: string,
    data: {
      friendlyName?: string;
      sourceFolders?: string[];
      autoBackupEnabled?: boolean;
      verifyBackups?: boolean;
      preserveVersions?: boolean;
    }
  ): Promise<{ success: boolean; drive: RemovableDrive; profile: BackupProfile }> {
    return this.safeFetchJson(`/api/drives/${encodeURIComponent(stableId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
  }

  public static async unregisterDrive(stableId: string): Promise<boolean> {
    const json = await this.safeFetchJson<{ success: boolean }>(`/api/drives/${encodeURIComponent(stableId)}`, {
      method: 'DELETE',
    });
    return json.success;
  }

  public static async getCurrentBackup(): Promise<{ session: BackupSession | null; isRunning: boolean }> {
    return this.safeFetchJson('/api/backup/current');
  }

  public static async startBackup(stableHardwareId?: string): Promise<{ success: boolean; session: BackupSession }> {
    return this.safeFetchJson('/api/backup/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ stableHardwareId }),
    });
  }

  public static async cancelBackup(): Promise<boolean> {
    const json = await this.safeFetchJson<{ success: boolean }>('/api/backup/cancel', { method: 'POST' });
    return json.success;
  }

  public static async getHistory(): Promise<BackupSession[]> {
    const json = await this.safeFetchJson<{ history: BackupSession[] }>('/api/history');
    return json.history;
  }

  public static async getHistorySession(id: string): Promise<BackupSession> {
    const json = await this.safeFetchJson<{ session: BackupSession }>(`/api/history/${encodeURIComponent(id)}`);
    return json.session;
  }

  public static async clearHistory(): Promise<boolean> {
    const json = await this.safeFetchJson<{ success: boolean }>('/api/history', { method: 'DELETE' });
    return json.success;
  }

  public static async getSettings(): Promise<AppSettings> {
    return this.safeFetchJson<AppSettings>('/api/settings');
  }

  public static async updateSettings(settings: Partial<AppSettings>): Promise<AppSettings> {
    return this.safeFetchJson<AppSettings>('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  }

  // --- Windows Startup Registration API ---
  public static async getStartupStatus(): Promise<StartupStatus> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.getStartupStatus) {
      try {
        const res = await (window as any).electronAPI.getStartupStatus();
        if (res) return res;
      } catch (err) {
        console.warn('[ApiClient] electronAPI.getStartupStatus failed, querying REST:', err);
      }
    }
    return this.safeFetchJson<StartupStatus>('/api/system/startup');
  }

  public static async setStartupStatus(enabled: boolean): Promise<StartupStatus> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.setStartupStatus) {
      try {
        const res = await (window as any).electronAPI.setStartupStatus(enabled);
        if (res) return res;
      } catch (err) {
        console.warn('[ApiClient] electronAPI.setStartupStatus failed, querying REST:', err);
      }
    }
    return this.safeFetchJson<StartupStatus>('/api/system/startup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  // --- UpdateManager, StabilityReporter & GlobalAdoptionMonitor APIs ---
  public static async getServicesStatus(): Promise<AllServicesStatus> {
    return this.safeFetchJson<AllServicesStatus>('/api/system/services-status');
  }

  public static async checkForUpdates(force = false): Promise<{
    checked: boolean;
    state: ServiceConfigState;
    message: string;
    updateAvailable: boolean;
    manifest?: UpdateManifest;
  }> {
    return this.safeFetchJson('/api/updates/check', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ force }),
    });
  }

  public static async flushStabilityReports(): Promise<{
    sent: number;
    remaining: number;
    message: string;
  }> {
    return this.safeFetchJson('/api/stability/flush', {
      method: 'POST',
    });
  }

  public static async sendAdoptionHeartbeat(): Promise<{
    success: boolean;
    message: string;
  }> {
    return this.safeFetchJson('/api/adoption/heartbeat', {
      method: 'POST',
    });
  }

  public static async setStabilityConsent(enabled: boolean): Promise<{
    success: boolean;
    stabilityConsent: boolean;
    stabilityReporter: StabilityReporterStatus;
  }> {
    return this.safeFetchJson('/api/settings/stability-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  public static async setAdoptionConsent(enabled: boolean): Promise<{
    success: boolean;
    adoptionConsent: boolean;
    adoptionMonitor: AdoptionMonitorStatus;
  }> {
    return this.safeFetchJson('/api/settings/adoption-consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
  }

  public static async recordLegalAcceptance(type: 'eula' | 'privacy', version: string): Promise<{
    success: boolean;
    legalAcceptance: LegalAcceptance;
  }> {
    return this.safeFetchJson('/api/settings/legal-acceptance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type, version }),
    });
  }

  // --- Backup Reminders API ---
  public static async getReminderStatus(): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/status');
  }

  public static async updateReminderSettings(settings: Partial<BackupReminderSettings>): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(settings),
    });
  }

  public static async snoozeReminder(minutes: number = 60): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/snooze', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ minutes }),
    });
  }

  public static async clearReminderSnooze(): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/clear-snooze', {
      method: 'POST',
    });
  }

  public static async dismissReminder(): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/dismiss', {
      method: 'POST',
    });
  }

  public static async triggerTestReminder(): Promise<ReminderStatus> {
    return this.safeFetchJson<ReminderStatus>('/api/reminders/test', {
      method: 'POST',
    });
  }

  public static async getSystemFolders(): Promise<{ folders: { name: string; path: string; fileCount: number }[] }> {
    return this.safeFetchJson('/api/system/folders');
  }

  public static async getPlatformInfo(): Promise<PlatformInfo> {
    return this.safeFetchJson('/api/platform/info');
  }

  public static async browseNativeFolder(): Promise<string | null> {
    // If running in Electron with IPC bridge
    if ((window as any).electronAPI?.browseFolder) {
      return (window as any).electronAPI.browseFolder();
    }
    const res = await fetch('/api/folders/browse', { method: 'POST' });
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) return null;
    const json = await res.json();
    return json.selectedPath || null;
  }

  public static async validateFolder(folderPath: string): Promise<{ valid: boolean; path?: string; name?: string; fileCount?: number; error?: string }> {
    return this.safeFetchJson('/api/folders/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ folderPath }),
    });
  }

  public static async getLogs(): Promise<{ logs: AppLogEntry[]; logFilePath: string }> {
    return this.safeFetchJson('/api/logs');
  }

  // SSE Stream Subscription
  public static subscribeToEvents(callbacks: {
    onConnected?: (drive: RemovableDrive) => void;
    onUnregisteredDetected?: (drive: RemovableDrive) => void;
    onDisconnected?: (drive: RemovableDrive) => void;
    onDriveUpdated?: (data: any) => void;
    onDriveRegistered?: (data: any) => void;
    onDriveUnregistered?: (data: any) => void;
    onBackupStart?: (session: BackupSession) => void;
    onBackupUpdate?: (session: BackupSession) => void;
    onBackupComplete?: (session: BackupSession) => void;
    onSettingsUpdated?: (settings: AppSettings) => void;
    onReminderDue?: (data: ReminderNotificationData) => void;
    onReminderStatus?: (status: ReminderStatus) => void;
  }): () => void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }

    const sseUrl = `${getApiBaseUrl()}/api/events`;
    console.log(`[ApiClient] Connecting to event stream at: ${sseUrl}`);

    let es: EventSource | null = null;
    let isClosed = false;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connectSSE = () => {
      if (isClosed) return;
      try {
        es = new EventSource(sseUrl);
        this.eventSource = es;

        es.onopen = () => {
          console.log(`[ApiClient] SSE event stream connected successfully (${sseUrl})`);
        };

        es.onerror = (err) => {
          console.warn(`[ApiClient] SSE stream connection error, will retry in 3s:`, err);
          if (es) {
            es.close();
            es = null;
          }
          if (!isClosed && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
              reconnectTimer = null;
              connectSSE();
            }, 3000);
          }
        };

        es.addEventListener('drive:connected', (e) => {
          try { callbacks.onConnected?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('drive:unregistered_detected', (e) => {
          try { callbacks.onUnregisteredDetected?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('drive:disconnected', (e) => {
          try { callbacks.onDisconnected?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('drive:updated', (e) => {
          try { callbacks.onDriveUpdated?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('drive:registered', (e) => {
          try { callbacks.onDriveRegistered?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('drive:unregistered', (e) => {
          try { callbacks.onDriveUnregistered?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('backup:start', (e) => {
          try { callbacks.onBackupStart?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('backup:catchup', (e) => {
          try {
            const session = JSON.parse(e.data);
            if (['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted', 'stopped_insufficient_space'].includes(session.status)) {
              callbacks.onBackupComplete?.(session);
            } else {
              callbacks.onBackupUpdate?.(session);
            }
          } catch {}
        });

        es.addEventListener('backup:update', (e) => {
          try {
            const session = JSON.parse(e.data);
            if (['completed', 'completed_with_errors', 'failed', 'cancelled', 'interrupted', 'stopped_insufficient_space'].includes(session.status)) {
              callbacks.onBackupComplete?.(session);
            } else {
              callbacks.onBackupUpdate?.(session);
            }
          } catch {}
        });

        es.addEventListener('backup:complete', (e) => {
          try { callbacks.onBackupComplete?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('settings:updated', (e) => {
          try { callbacks.onSettingsUpdated?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('reminder:due', (e) => {
          try { callbacks.onReminderDue?.(JSON.parse(e.data)); } catch {}
        });

        es.addEventListener('reminder:status', (e) => {
          try { callbacks.onReminderStatus?.(JSON.parse(e.data)); } catch {}
        });
      } catch (connErr) {
        console.warn(`[ApiClient] Failed to instantiate EventSource:`, connErr);
      }
    };

    connectSSE();

    // Secondary channel: Wire Electron IPC listeners if running in desktop environment
    const ipcCleanups: (() => void)[] = [];
    if (typeof window !== 'undefined' && (window as any).electronAPI) {
      const api = (window as any).electronAPI;
      if (typeof api.onBackupUpdate === 'function') {
        const cleanup = api.onBackupUpdate((session: BackupSession) => {
          callbacks.onBackupUpdate?.(session);
        });
        ipcCleanups.push(cleanup);
      }
      if (typeof api.onBackupComplete === 'function') {
        const cleanup = api.onBackupComplete((session: BackupSession) => {
          callbacks.onBackupComplete?.(session);
        });
        ipcCleanups.push(cleanup);
      }
      if (typeof api.onDriveConnected === 'function') {
        const cleanup = api.onDriveConnected((drive: RemovableDrive) => {
          callbacks.onConnected?.(drive);
        });
        ipcCleanups.push(cleanup);
      }
      if (typeof api.onDriveDisconnected === 'function') {
        const cleanup = api.onDriveDisconnected((drive: RemovableDrive) => {
          callbacks.onDisconnected?.(drive);
        });
        ipcCleanups.push(cleanup);
      }
      if (typeof api.onReminderDue === 'function') {
        const cleanup = api.onReminderDue((data: ReminderNotificationData) => {
          callbacks.onReminderDue?.(data);
        });
        ipcCleanups.push(cleanup);
      }
      if (typeof api.onReminderStatus === 'function') {
        const cleanup = api.onReminderStatus((status: ReminderStatus) => {
          callbacks.onReminderStatus?.(status);
        });
        ipcCleanups.push(cleanup);
      }
    }

    return () => {
      isClosed = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (es) {
        es.close();
        es = null;
      }
      this.eventSource = null;
      ipcCleanups.forEach(c => { try { c(); } catch {} });
    };
  }
}
