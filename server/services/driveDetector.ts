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
      `[Detector] [${new Date().toISOString()}] lock acquire attempted (hint: ${hintDriveLetter || 'none'})`
    );

    if (this.inFlightScan) {
      if (now - this.inFlightScanStartedAt > 25000) {
        console.warn(
          `[Detector] [${new Date().toISOString()}] lock forced release (held for >25s). Lock expired.`
        );
        this.inFlightScan = null;
      } else {
        console.log(
          `[Detector] [${new Date().toISOString()}] lock already held (in-flight since ${now - this.inFlightScanStartedAt}ms ago). Coalescing.`
        );
        return this.inFlightScan;
      }
    }

    this.inFlightScanStartedAt = Date.now();
    console.log(
      `[Detector] [${new Date().toISOString()}] lock acquired (hint: ${hintDriveLetter || 'none'})`
    );

    // Hard 20-second bounded execution
    const hardTimeoutPromise = new Promise<RemovableDrive[]>((resolve) => {
      setTimeout(() => {
        console.warn(
          `[Detector] [${new Date().toISOString()}] Detection pipeline hard timeout reached (20s). Triggering fallback.`
        );
        if (hintDriveLetter) {
          const fallbackDrive = this.createPartialFallbackDrive(hintDriveLetter);
          resolve([fallbackDrive]);
        } else {
          resolve(Array.from(this.activeDrives.values()));
        }
      }, 20000);
    });

    this.inFlightScan = Promise.race([
      this.executeScan(hintDriveLetter),
      hardTimeoutPromise,
    ]).finally(() => {
      const elapsed = Date.now() - this.inFlightScanStartedAt;
      console.log(
        `[Detector] [${new Date().toISOString()}] lock release (elapsed: ${elapsed}ms)`
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

    // 1. Fast-path first: If a specific drive letter was provided, attempt ultra-light fast path (<400ms)
    let platformDrives: any[] = [];
    if (hintDriveLetter && typeof (this.platformAdapter as any).detectRemovableDriveFast === 'function') {
      try {
        const fastResult = await (this.platformAdapter as any).detectRemovableDriveFast(hintDriveLetter);
        if (fastResult) {
          platformDrives = [fastResult];
        }
      } catch (err: any) {
        console.warn(`[Adapter] [${new Date().toISOString()}] fast-path error: ${err.message}`);
      }
    }

    // Only if fast path did not match or timed out, fall back to heavy multi-tier logic
    if (platformDrives.length === 0) {
      if (hintDriveLetter) {
        console.log(`[Adapter] falling back to multi-tier`);
      }
      try {
        platformDrives = await this.platformAdapter.detectExternalDrives(hintDriveLetter);
      } catch (err: any) {
        this.db.log('error', 'DriveDetector', `Platform drive detection failed: ${err.message}`);
      }
    }

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

    // If hint letter was checked and matches system drive, emit drive:ignored
    if (hintDriveLetter && detectedNow.size === 0) {
      const cleanHint = hintDriveLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const sysLetter = (process.env.SystemDrive || 'C:').replace(/[^a-zA-Z]/g, '').toUpperCase();
      if (cleanHint === sysLetter) {
        console.log(`[Detector] classification: IGNORED for drive ${cleanHint}: (System Drive)`);
        console.log(`[Detector] [${new Date().toISOString()}] Hint letter ${hintDriveLetter} matches system drive. Emitting drive:ignored.`);
        this.emit('drive:ignored', { driveLetter: `${cleanHint}:`, reason: 'System Drive - not a backup target' });
      }
    }

    // Pipeline-level fallback: if adapter produced zero drives but hint letter is present,
    // verify the root volume actually exists physically before generating a fallback.
    // If it is physically absent, the drive was removed.
    if (detectedNow.size === 0 && hintDriveLetter) {
      const cleanLetter = hintDriveLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
      const rootPath = `${cleanLetter}:\\`;
      let physicallyPresent = false;
      try {
        physicallyPresent = fs.existsSync(rootPath);
      } catch {}

      if (physicallyPresent) {
        console.warn(
          `[DriveDetector] [${new Date().toISOString()}] Adapter produced 0 drives for hint letter ${hintDriveLetter}, but ${rootPath} is physically mounted. Generating fallback partial drive.`
        );
        const partialDrive = this.createPartialFallbackDrive(hintDriveLetter);
        detectedNow.set(partialDrive.stableHardwareId, partialDrive);
      } else {
        console.log(
          `[DriveDetector] [${new Date().toISOString()}] Volume ${rootPath} is physically absent. NOT generating fallback partial drive.`
        );
      }
    }

    // 2. State reconciliation and event emission
    // Match identity continuity: if a drive in detectedNow matches an existing active drive
    // by volumeSerial or driveLetter, preserve the existing stableHardwareId.
    const reconciledDrives = new Map<string, RemovableDrive>();
    for (const [stableId, drive] of detectedNow.entries()) {
      let finalStableId = stableId;
      for (const [existingId, existingDrive] of this.activeDrives.entries()) {
        if (
          (drive.volumeSerial && drive.volumeSerial !== 'UNKNOWN' && existingDrive.volumeSerial === drive.volumeSerial) ||
          (drive.driveLetter && existingDrive.driveLetter === drive.driveLetter)
        ) {
          finalStableId = existingId;
          drive.stableHardwareId = existingId;
          drive.id = existingDrive.id;
          break;
        }
      }
      reconciledDrives.set(finalStableId, drive);
    }

    const currentActiveStableIds = new Set(reconciledDrives.keys());

    // Check newly connected or updated drives
    for (const [stableId, drive] of reconciledDrives.entries()) {
      const previous = this.activeDrives.get(stableId);
      const isExplicitArrival = Boolean(
        hintDriveLetter &&
        drive.driveLetter &&
        drive.driveLetter.toUpperCase().startsWith(hintDriveLetter.toUpperCase().replace(/[^a-zA-Z]/g, ''))
      );
      const isNewConnection = !previous || !previous.isConnected || isExplicitArrival;

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
        console.log(`[Detector] classification: ${classification} for drive ${drive.stableHardwareId} [${drive.driveLetter}] (${drive.volumeLabel || 'Removable'})`);
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

    // Check disconnected drives with physical existence verification
    for (const [stableId, drive] of this.activeDrives.entries()) {
      if (drive.isConnected) {
        // If this was a targeted scan for a specific drive letter, do not evaluate other letters
        if (hintDriveLetter) {
          const cleanHint = hintDriveLetter.replace(/[^a-zA-Z]/g, '').toUpperCase();
          const cleanDrive = (drive.driveLetter || '').replace(/[^a-zA-Z]/g, '').toUpperCase();
          if (cleanHint !== cleanDrive) {
            continue; // Not targeting this drive letter
          }
        }

        // Verify physical absence before emitting disconnection. If mountPath still exists, the drive is STILL physically connected!
        let isPhysicallyPresent = false;
        if (drive.mountPath) {
          try {
            isPhysicallyPresent = fs.existsSync(drive.mountPath);
          } catch {}
        }

        if (!currentActiveStableIds.has(stableId) && !isPhysicallyPresent) {
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
    }


    const currentDrives = Array.from(this.activeDrives.values());
    console.log(`[Detector] [${new Date().toISOString()}] Scan completed. Total active drive(s): ${currentDrives.filter(d => d.isConnected).length} -> [${currentDrives.filter(d => d.isConnected).map(d => `${d.driveLetter} (${d.stableHardwareId})`).join(', ')}]`);
    return currentDrives;
  }

  public getActiveDrives(): RemovableDrive[] {
    return Array.from(this.activeDrives.values());
  }

  public getDriveByStableId(stableId: string): RemovableDrive | undefined {
    if (!stableId) return undefined;
    const direct = this.activeDrives.get(stableId);
    if (direct) return direct;

    const targetLower = stableId.toLowerCase();
    for (const [id, d] of this.activeDrives.entries()) {
      if (id.toLowerCase() === targetLower) return d;
    }

    for (const d of this.activeDrives.values()) {
      if (d.driveLetter && stableId.toUpperCase().includes(d.driveLetter.replace(/[^a-zA-Z]/g, '').toUpperCase())) {
        return d;
      }
    }

    return undefined;
  }

  public handleDeviceRemoval(driveLetterOrId?: string): RemovableDrive[] {
    const target = driveLetterOrId ? driveLetterOrId.toUpperCase().replace(/[^a-zA-Z0-9]/g, '') : null;
    console.log(`[Detector] [${new Date().toISOString()}] handleDeviceRemoval invoked for: ${driveLetterOrId || 'all absent drives'}`);

    const removed: RemovableDrive[] = [];
    for (const [stableId, drive] of this.activeDrives.entries()) {
      const cleanLetter = drive.driveLetter ? drive.driveLetter.toUpperCase().replace(/[^a-zA-Z]/g, '') : '';
      const cleanId = drive.stableHardwareId ? drive.stableHardwareId.toUpperCase().replace(/[^a-zA-Z0-9]/g, '') : '';
      const match = !target || cleanLetter === target || cleanId === target || (drive.volumeSerial && drive.volumeSerial.toUpperCase() === target);

      let isPresent = false;
      if (drive.mountPath) {
        try {
          isPresent = fs.existsSync(drive.mountPath);
        } catch {
          isPresent = false;
        }
      }

      if (match && !isPresent && drive.isConnected) {
        drive.isConnected = false;
        removed.push(drive);
        console.log(`[Detector] [${new Date().toISOString()}] State transition: CONNECTED -> DISCONNECTED for drive ${drive.stableHardwareId} [${drive.driveLetter}]`);
        this.db.log(
          'warn',
          'DriveDetector',
          `Storage device disconnected: ${drive.friendlyName || drive.volumeLabel || 'Disk'} [${drive.driveLetter}] (${stableId})`
        );
        this.emit('drive:disconnected', drive);
      }
    }
    return removed;
  }
}
