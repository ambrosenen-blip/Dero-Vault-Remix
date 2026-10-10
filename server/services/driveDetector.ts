/**
 * Dero Vault — Drive Detection & Identification Engine
 * Cross-platform storage monitor with platform-specific adapters.
 * Detects USB flash drives, external USB HDDs, external USB SSDs, and enclosures.
 * Uses persistent physical hardware serials and volume serials (NOT volatile drive letters).
 * Strictly isolated: Zero mock data in production.
 */

import { EventEmitter } from 'events';
import fs from 'fs';
import path from 'path';
import { RemovableDrive } from '../types.js';
import { LocalDatabase } from './localDb.js';
import { IPlatformAdapter, PlatformService } from '../platform/index.js';

export class DriveDetector extends EventEmitter {
  private db: LocalDatabase;
  private platformAdapter: IPlatformAdapter;
  private activeDrives: Map<string, RemovableDrive> = new Map(); // Keyed by stableHardwareId
  private pollingTimer: NodeJS.Timeout | null = null;
  private inFlightScan: Promise<RemovableDrive[]> | null = null;
  private inFlightScanStartedAt: number = 0;

  constructor(db: LocalDatabase) {
    super();
    this.db = db;
    this.platformAdapter = PlatformService.getAdapter();
  }

  public getPlatformAdapter(): IPlatformAdapter {
    return this.platformAdapter;
  }

  public startMonitoring(intervalMs: number = 2500): void {
    if (this.pollingTimer) return;

    this.checkDrives();
    this.pollingTimer = setInterval(() => {
      this.checkDrives().catch((err) => {
        this.db.log('error', 'DriveDetector', `Error during drive polling: ${err.message}`);
      });
    }, intervalMs);

    this.db.log(
      'info',
      'DriveDetector',
      `Real-time drive detection started (${this.platformAdapter.platformName} [${this.platformAdapter.platform}], Polling: ${intervalMs}ms)`
    );
  }

  public stopMonitoring(): void {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
  }

  /**
   * Scans current system drives using the platform adapter and reconciles connection state.
   * Coalesces concurrent calls to prevent adapter / child_process thrashing.
   * Enforces a 10-second TTL on the in-flight deduplication lock.
   */
  public async checkDrives(hintDriveLetter?: string): Promise<RemovableDrive[]> {
    const now = Date.now();
    console.log(
      `[Detector] [${new Date().toISOString()}] Lock acquire attempted (hint: ${hintDriveLetter || 'none'})`
    );

    if (this.inFlightScan) {
      if (now - this.inFlightScanStartedAt > 10000) {
        console.warn(
          `[Detector] [${new Date().toISOString()}] Lock held for >10s (${now - this.inFlightScanStartedAt}ms) — forcing release. Lock expired.`
        );
        this.inFlightScan = null;
      } else {
        console.log(
          `[Detector] [${new Date().toISOString()}] Lock already held (in-flight since ${now - this.inFlightScanStartedAt}ms ago). Coalescing.`
        );
        return this.inFlightScan;
      }
    }

    this.inFlightScanStartedAt = Date.now();
    console.log(
      `[Detector] [${new Date().toISOString()}] Lock acquired (hint: ${hintDriveLetter || 'none'})`
    );

    // Hard 10-second bounded execution
    const hardTimeoutPromise = new Promise<RemovableDrive[]>((resolve) => {
      setTimeout(() => {
        console.warn(
          `[Detector] [${new Date().toISOString()}] Detection pipeline hard timeout reached (10s). Triggering fallback.`
        );
        if (hintDriveLetter) {
          const fallbackDrive = this.createPartialFallbackDrive(hintDriveLetter);
          resolve([fallbackDrive]);
        } else {
          resolve(Array.from(this.activeDrives.values()));
        }
      }, 10000);
    });

    this.inFlightScan = Promise.race([
      this.executeScan(hintDriveLetter),
      hardTimeoutPromise,
    ]).finally(() => {
      const elapsed = Date.now() - this.inFlightScanStartedAt;
      console.log(
        `[Detector] [${new Date().toISOString()}] Lock released (elapsed: ${elapsed}ms)`
      );
      this.inFlightScan = null;
    });

    return this.inFlightScan;
  }

  private createPartialFallbackDrive(rawLetter: string): RemovableDrive {
    const cleanLetter = rawLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
    const driveLetter = `${cleanLetter}:`;
    const stableId = `UNVERIFIED-${cleanLetter}`;

    const drive: RemovableDrive = {
      id: `drv_${stableId}`,
      stableHardwareId: stableId,
      volumeSerial: 'UNVERIFIED',
      volumeLabel: 'USB Storage',
      driveLetter: driveLetter,
      mountPath: `${driveLetter}\\`,
      totalBytes: 0,
      freeBytes: 0,
      fileSystem: 'FAT32',
      deviceModel: 'Removable USB Disk',
      busType: 'USB',
      platform: this.platformAdapter.platform,
      isRemovable: true,
      isRegistered: false,
      isConnected: true,
      isSystemDrive: false,
      lastConnectedAt: new Date().toISOString(),
      partial: true,
      reason: 'detection-timeout',
    };

    return drive;
  }

  private async executeScan(hintDriveLetter?: string): Promise<RemovableDrive[]> {
    const detectedNow: Map<string, RemovableDrive> = new Map();

    // 1. Query external drives via current operating system adapter
    try {
      const platformDrives = await this.platformAdapter.detectExternalDrives();
      for (const pd of platformDrives) {
        const drive: RemovableDrive = {
          id: `drv_${pd.stableHardwareId.replace(/[^a-zA-Z0-9_-]/g, '')}`,
          stableHardwareId: pd.stableHardwareId,
          volumeSerial: pd.volumeSerial,
          volumeLabel: pd.volumeLabel,
          driveLetter: pd.driveIdentifier,
          mountPath: pd.mountPath,
          totalBytes: pd.totalBytes,
          freeBytes: pd.freeBytes,
          fileSystem: pd.fileSystem,
          deviceModel: pd.deviceModel,
          physicalSerial: pd.physicalSerial,
          pnpDeviceId: pd.pnpDeviceId,
          busType: pd.busType || 'USB',
          platform: this.platformAdapter.platform,
          isRemovable: true,
          isRegistered: false,
          isConnected: true,
          isSystemDrive: false,
          lastConnectedAt: new Date().toISOString(),
          partial: pd.partial,
          reason: pd.reason,
        };
        detectedNow.set(drive.stableHardwareId, drive);
      }
    } catch (err: any) {
      this.db.log('error', 'DriveDetector', `Platform drive detection failed: ${err.message}`);
    }

    // Pipeline-level fallback: if adapter produced zero drives but hint letter is present
    if (detectedNow.size === 0 && hintDriveLetter) {
      console.warn(
        `[DriveDetector] [${new Date().toISOString()}] Adapter produced 0 drives for hint letter ${hintDriveLetter}. Generating fallback partial drive.`
      );
      const partialDrive = this.createPartialFallbackDrive(hintDriveLetter);
      detectedNow.set(partialDrive.stableHardwareId, partialDrive);
    }

    // 2. State reconciliation and event emission
    const currentActiveStableIds = new Set(detectedNow.keys());

    // Check newly connected or updated drives
    for (const [stableId, drive] of detectedNow.entries()) {
      const previous = this.activeDrives.get(stableId);
      const isNewConnection = !previous || !previous.isConnected;

      // Check if this physical drive is already registered in local database
      const registered = this.db.getRegisteredDriveByStableId(stableId);
      if (registered) {
        drive.isRegistered = true;
        drive.friendlyName = registered.friendlyName;
        drive.registeredAt = registered.registeredAt;
        drive.lastBackupAt = registered.lastBackupAt;
        drive.backupProfileId = registered.backupProfileId;

        // If OS reassigned drive letter or mount path, update database
        if (registered.driveLetter !== drive.driveLetter || registered.mountPath !== drive.mountPath) {
          this.db.updateRegisteredDrive(stableId, {
            driveLetter: drive.driveLetter,
            mountPath: drive.mountPath,
            lastConnectedAt: new Date().toISOString(),
          });
          this.db.log(
            'info',
            'DriveDetector',
            `Registered drive "${drive.friendlyName}" reconnected with updated identifier: ${drive.driveLetter} (was ${registered.driveLetter})`
          );
        }
      }

      this.activeDrives.set(stableId, drive);

      if (isNewConnection) {
        const classification = drive.isRegistered ? 'REGISTERED' : 'UNREGISTERED';
        console.log(`[Detector] [${new Date().toISOString()}] Classification result: ${classification} for drive ${drive.stableHardwareId} [${drive.driveLetter}] (${drive.volumeLabel || 'Removable'})`);
        console.log(`[Detector] [${new Date().toISOString()}] State transition: DISCONNECTED -> CONNECTED for drive ${drive.stableHardwareId} [${drive.driveLetter}] (${drive.volumeLabel || 'Removable'})`);
        this.db.log(
          'info',
          'DriveDetector',
          `Storage device connected: ${drive.volumeLabel || 'Removable Disk'} [${drive.driveLetter}] (${drive.deviceModel || 'USB Storage'})`
        );
        this.emit('drive:connected', drive);

        if (!drive.isRegistered) {
          this.emit('drive:unregistered_detected', drive);
        }
      }
    }

    // Check disconnected drives
    for (const [stableId, drive] of this.activeDrives.entries()) {
      if (!currentActiveStableIds.has(stableId) && drive.isConnected) {
        drive.isConnected = false;
        console.log(`[Detector] [${new Date().toISOString()}] State transition: CONNECTED -> DISCONNECTED for drive ${drive.stableHardwareId} [${drive.driveLetter}]`);
        this.db.log(
          'warn',
          'DriveDetector',
          `Storage device disconnected: ${drive.friendlyName || drive.volumeLabel || 'Disk'} [${drive.driveLetter}] (${stableId})`
        );
        this.emit('drive:disconnected', drive);
      }
    }

    const currentDrives = Array.from(this.activeDrives.values());
    console.log(`[Detector] [${new Date().toISOString()}] Scan completed. Total active drive(s): ${currentDrives.filter(d => d.isConnected).length} -> [${currentDrives.filter(d => d.isConnected).map(d => `${d.driveLetter} (${d.stableHardwareId})`).join(', ')}]`);
    return currentDrives;
  }

  public getActiveDrives(): RemovableDrive[] {
    return Array.from(this.activeDrives.values());
  }

  public getDriveByStableId(stableId: string): RemovableDrive | undefined {
    return this.activeDrives.get(stableId);
  }
}
