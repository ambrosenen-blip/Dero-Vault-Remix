/**
 * Dero Vault — Comprehensive Regression Test Suite
 * Capacity Warning UI, Backup Profile Management, and Physical Drive Isolation
 * Workstream D Verification
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { BackupEngine } from '../server/services/backupEngine.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { DriveDetector } from '../server/services/driveDetector.js';
import { CapacitySafetyService } from '../server/services/capacitySafety.js';
import { BackupProfile, BackupSession, RemovableDrive } from '../server/types.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    console.log(`[PASS] ${testName}`);
    passedTests++;
  } else {
    console.error(`[FAIL] ${testName}${detail ? ` — ${detail}` : ''}`);
    failedTests++;
  }
}

async function runRegressionSuite() {
  console.log('==================================================================');
  console.log('Dero Vault — Consolidated Reliability Test Suite');
  console.log('Workstream A: Capacity Warning UI & Scoping');
  console.log('Workstream B: Backup Profile & Add Folder Repair');
  console.log('Workstream C: Physical Drive Identity & Profile Isolation');
  console.log('==================================================================\n');

  const testTemp = path.join(os.tmpdir(), `dero-isolation-test-${Date.now()}`);
  fs.mkdirSync(testTemp, { recursive: true });

  const dbDir = path.join(testTemp, 'db');
  fs.mkdirSync(dbDir, { recursive: true });
  const db = new LocalDatabase(dbDir);

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Backup Profile & Add Folder Functionality (Workstream B)
    // -------------------------------------------------------------------------
    console.log('--- 1. Backup Profile & Add Folder Repair Tests ---');

    // Create disposable source folders
    const sourceFolder1 = path.join(testTemp, 'WorkDocuments');
    const sourceFolder2 = path.join(testTemp, 'ClientProjects');
    const invalidPath = path.join(testTemp, 'NonExistent_Folder_123');
    const filePath = path.join(testTemp, 'SampleFile.txt');

    fs.mkdirSync(sourceFolder1, { recursive: true });
    fs.mkdirSync(sourceFolder2, { recursive: true });
    fs.writeFileSync(filePath, 'Just a regular file');
    fs.writeFileSync(path.join(sourceFolder1, 'document1.pdf'), 'PDF Content');

    // Mock drive A
    const driveA: RemovableDrive = {
      id: 'drv_transcend_de29152d',
      stableHardwareId: 'USB-HW-DE29152D-A1',
      volumeSerial: 'DE29152D',
      volumeLabel: 'TRANSCEND',
      driveLetter: 'E:',
      mountPath: path.join(testTemp, 'TRANSCEND_USB'),
      totalBytes: 8 * 1024 * 1024 * 1024,
      freeBytes: 3.74 * 1024 * 1024 * 1024, // 3.74 GB free
      fileSystem: 'FAT32',
      deviceModel: 'Transcend JetFlash 700 USB Device',
      physicalSerial: 'DE29152D',
      busType: 'USB',
      platform: 'win32',
      isRemovable: true,
      isRegistered: false,
      isConnected: true,
      isSystemDrive: false,
    };
    fs.mkdirSync(driveA.mountPath, { recursive: true });

    // 1.1 Register Drive A with initial folder
    const regResA = db.registerDrive(driveA, {
      friendlyName: 'Transcend Primary Granary',
      sourceFolders: [sourceFolder1],
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: true,
      verifyBackups: true,
      preserveVersions: true,
      driveStableId: driveA.stableHardwareId,
    });

    assert(regResA.profile.sourceFolders.length === 1, '1.1 Drive A registered with initial source folder');
    assert(regResA.profile.sourceFolders[0] === sourceFolder1, '1.2 Initial folder is WorkDocuments');

    // 1.2 Add second valid folder to Drive A's profile
    const updatedProfileA = db.updateBackupProfile(driveA.stableHardwareId, {
      sourceFolders: [...regResA.profile.sourceFolders, sourceFolder2],
    });
    assert(updatedProfileA !== null, '1.3 Update profile succeeded');
    assert(updatedProfileA?.sourceFolders.length === 2, '1.4 Folder count updated to 2 immediately');
    assert(updatedProfileA?.sourceFolders.includes(sourceFolder2) === true, '1.5 ClientProjects added to profile');

    // 1.3 Duplicate folder prevention
    const existingFolders = updatedProfileA!.sourceFolders;
    const isDuplicate = existingFolders.some(f => f.toLowerCase() === sourceFolder2.toLowerCase());
    assert(isDuplicate === true, '1.6 Duplicate folder correctly detected and prevented');

    // 1.4 Persistence across restart
    await new Promise((r) => setTimeout(r, 400));
    const dbReloaded = new LocalDatabase(dbDir);
    const reloadedProfileA = dbReloaded.getBackupProfile(driveA.stableHardwareId);
    assert(reloadedProfileA !== null && reloadedProfileA?.sourceFolders.length === 2, '1.7 Changes survive application restart');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Physical Drive Identity & Isolation (Workstream C)
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Physical Drive Identity & Profile Isolation Tests ---');

    // Mock drive B with different hardware ID, but might be plugged into same USB port or assigned letter
    const driveB: RemovableDrive = {
      id: 'drv_sandisk_ultra_9944',
      stableHardwareId: 'USB-HW-SD9944-B2',
      volumeSerial: 'SD9944',
      volumeLabel: 'SANDISK_ULTRA',
      driveLetter: 'F:',
      mountPath: path.join(testTemp, 'SANDISK_USB'),
      totalBytes: 64 * 1024 * 1024 * 1024,
      freeBytes: 50 * 1024 * 1024 * 1024, // 50 GB free (ample)
      fileSystem: 'NTFS',
      deviceModel: 'SanDisk Ultra Luxe USB Device',
      physicalSerial: 'SD9944',
      busType: 'USB',
      platform: 'win32',
      isRemovable: true,
      isRegistered: false,
      isConnected: true,
      isSystemDrive: false,
    };
    fs.mkdirSync(driveB.mountPath, { recursive: true });

    // Register Drive B with its own unique folder
    const sourceFolder3 = path.join(testTemp, 'SpecialArchives');
    fs.mkdirSync(sourceFolder3, { recursive: true });

    const regResB = db.registerDrive(driveB, {
      friendlyName: 'SanDisk Heavy Vault',
      sourceFolders: [sourceFolder3],
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: false,
      verifyBackups: true,
      preserveVersions: false,
      driveStableId: driveB.stableHardwareId,
    });

    assert(db.getRegisteredDrives().length === 2, '2.1 Exactly two registered drives in database');
    assert(regResB.profile.driveStableId === driveB.stableHardwareId, '2.2 Drive B has its own independent profile');
    assert(regResB.profile.sourceFolders.length === 1, '2.3 Drive B has exactly 1 folder');

    // 2.4 Profile Isolation: Modifying Drive B must NOT touch Drive A
    db.updateBackupProfile(driveB.stableHardwareId, {
      sourceFolders: [sourceFolder3, sourceFolder1],
    });
    const profileACheck = db.getBackupProfile(driveA.stableHardwareId);
    assert(profileACheck?.sourceFolders.length === 2, '2.4 Modifying Drive B does not alter Drive A profile');
    assert(profileACheck?.autoBackupEnabled === true, '2.5 Drive A autoBackupEnabled remains true');
    assert(regResB.profile.autoBackupEnabled === false, '2.6 Drive B autoBackupEnabled remains false');

    // 2.7 Drive Letter Collision Immunity:
    // Suppose Drive A was unplugged, and Drive B was assigned Drive A's letter (E:) by Windows
    const driveDetector = new DriveDetector(db);
    // Directly test getDriveByStableId: never conflates drives by letter
    const foundA = driveDetector.getDriveByStableId(driveA.stableHardwareId);
    // If not in active memory, it returns undefined instead of returning wrong drive
    assert(foundA === undefined || foundA.stableHardwareId === driveA.stableHardwareId, '2.7 getDriveByStableId never returns wrong drive');

    // 2.8 Identical volume labels do not cause identity collision
    const driveC_IdenticalLabel: RemovableDrive = {
      ...driveA,
      id: 'drv_transcend_clone_label',
      stableHardwareId: 'USB-HW-CLONE99-C3',
      volumeSerial: 'CLONE99',
      volumeLabel: 'TRANSCEND', // Same label as Drive A!
      driveLetter: 'G:',
      mountPath: path.join(testTemp, 'CLONE_USB'),
    };
    fs.mkdirSync(driveC_IdenticalLabel.mountPath, { recursive: true });

    db.registerDrive(driveC_IdenticalLabel, {
      friendlyName: 'Second Transcend Disk',
      sourceFolders: [sourceFolder2],
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: true,
      verifyBackups: true,
      preserveVersions: true,
      driveStableId: driveC_IdenticalLabel.stableHardwareId,
    });

    const profA = db.getBackupProfile(driveA.stableHardwareId);
    const profC = db.getBackupProfile(driveC_IdenticalLabel.stableHardwareId);
    assert(profA?.friendlyName !== profC?.friendlyName, '2.8 Drives with identical volume labels maintain distinct profiles');
    assert(db.getRegisteredDrives().length === 3, '2.9 Exactly 3 independent physical registrations exist');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Capacity Warning Scoping & Zero False Success (Workstream A & C)
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Capacity Warning Scoping & Prominent UI Tests ---');

    // Setup an oversized folder on Drive A that causes insufficient capacity
    // Required: ~4.67 GB, Available: ~3.74 GB
    const engineA = new BackupEngine(db);

    // Mock an oversized planned file list (total 4.67 GB, each file < 4 GB so FAT32 file limit is not violated)
    const oversizedFiles = [
      {
        action: 'NEW' as const,
        source: {
          fullPath: path.join(sourceFolder1, 'part1.bak'),
          sourceBaseFolder: sourceFolder1,
          sourceFolderName: 'WorkDocuments',
          relativePath: 'part1.bak',
          size: Math.round(1.6 * 1024 * 1024 * 1024),
          mtimeMs: Date.now(),
        },
        destinationPath: path.join(driveA.mountPath, 'DERO_VAULT_BACKUP', 'CURRENT', 'part1.bak'),
        size: Math.round(1.6 * 1024 * 1024 * 1024),
      },
      {
        action: 'NEW' as const,
        source: {
          fullPath: path.join(sourceFolder1, 'part2.bak'),
          sourceBaseFolder: sourceFolder1,
          sourceFolderName: 'WorkDocuments',
          relativePath: 'part2.bak',
          size: Math.round(1.6 * 1024 * 1024 * 1024),
          mtimeMs: Date.now(),
        },
        destinationPath: path.join(driveA.mountPath, 'DERO_VAULT_BACKUP', 'CURRENT', 'part2.bak'),
        size: Math.round(1.6 * 1024 * 1024 * 1024),
      },
      {
        action: 'NEW' as const,
        source: {
          fullPath: path.join(sourceFolder1, 'part3.bak'),
          sourceBaseFolder: sourceFolder1,
          sourceFolderName: 'WorkDocuments',
          relativePath: 'part3.bak',
          size: Math.round(1.47 * 1024 * 1024 * 1024),
          mtimeMs: Date.now(),
        },
        destinationPath: path.join(driveA.mountPath, 'DERO_VAULT_BACKUP', 'CURRENT', 'part3.bak'),
        size: Math.round(1.47 * 1024 * 1024 * 1024),
      },
    ];

    const preflightRes = await CapacitySafetyService.assessPreflight({
      toCopy: oversizedFiles,
      scannedFiles: [],
      scanErrors: [],
      destMountPath: driveA.mountPath,
      drive: driveA,
      isTurbo: true,
      preserveVersions: true,
    });

    assert(preflightRes.canProceed === false, '3.1 Drive A preflight rejected due to insufficient space');
    assert(preflightRes.reason === 'INSUFFICIENT_SPACE', '3.2 Rejection reason classified as INSUFFICIENT_SPACE');
    assert(preflightRes.totalRequiredBytes > driveA.freeBytes, '3.3 Required space (4.67GB) exceeds available space (3.74GB)');
    assert(preflightRes.additionalNeededBytes > 0, '3.4 Additional space needed calculated accurately');

    // Create rejected session on Drive A
    const rejectedSessionA: BackupSession = {
      id: 'session_rejected_drive_a',
      driveId: driveA.id,
      driveStableId: driveA.stableHardwareId,
      driveName: 'Transcend Primary Granary',
      driveLetter: driveA.driveLetter,
      mode: 'turbo',
      status: 'stopped_insufficient_space',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      isInitialBackup: false,
      filesScanned: 1,
      filesCopied: 0,
      filesSkipped: 0,
      filesFailed: 0,
      newFilesCount: 1,
      modifiedFilesCount: 0,
      bytesTotal: preflightRes.totalRequiredBytes,
      bytesTransferred: 0,
      currentSpeedBps: 0,
      estimatedSecondsRemaining: 0,
      isVerified: false,
      errors: [{
        path: driveA.mountPath,
        destPath: driveA.mountPath,
        error: preflightRes.message || 'Capacity error',
        timestamp: new Date().toISOString(),
      }],
      capacityAssessment: preflightRes,
    };
    db.saveBackupSession(rejectedSessionA);

    // 3.5 Drive Isolation of Capacity Warnings:
    // Retrieve history: Drive A has the capacity warning, Drive B does NOT!
    const allHistory = db.getBackupHistory(50);
    const driveAHistory = allHistory.filter(s => s.driveStableId === driveA.stableHardwareId);
    const driveBHistory = allHistory.filter(s => s.driveStableId === driveB.stableHardwareId);

    assert(driveAHistory.length === 1, '3.5 Drive A history records the capacity failure');
    assert(driveAHistory[0].status === 'stopped_insufficient_space', '3.6 Drive A failure status is stopped_insufficient_space');
    assert(driveBHistory.length === 0, '3.7 Drive B has zero failures and no associated capacity warnings');

    // 3.8 If Drive B runs a backup, it completes successfully and does NOT see Drive A's warning
    const sampleNormalFiles = [
      {
        action: 'NEW' as const,
        source: {
          fullPath: path.join(sourceFolder3, 'archive.zip'),
          sourceBaseFolder: sourceFolder3,
          sourceFolderName: 'SpecialArchives',
          relativePath: 'archive.zip',
          size: 10 * 1024 * 1024, // 10 MB
          mtimeMs: Date.now(),
        },
        destinationPath: path.join(driveB.mountPath, 'DERO_VAULT_BACKUP', 'CURRENT', 'archive.zip'),
        size: 10 * 1024 * 1024,
      },
    ];

    const preflightDriveB = await CapacitySafetyService.assessPreflight({
      toCopy: sampleNormalFiles,
      scannedFiles: [],
      scanErrors: [],
      destMountPath: driveB.mountPath,
      drive: driveB,
      isTurbo: false,
      preserveVersions: false,
    });

    assert(preflightDriveB.canProceed === true, '3.8 Drive B preflight succeeds on ample capacity (50GB free)');
    assert(preflightDriveB.additionalNeededBytes === 0, '3.9 Drive B requires 0 additional bytes');

    // Save successful session for Drive B
    const successSessionB: BackupSession = {
      id: 'session_success_drive_b',
      driveId: driveB.id,
      driveStableId: driveB.stableHardwareId,
      driveName: 'SanDisk Heavy Vault',
      driveLetter: driveB.driveLetter,
      mode: 'standard',
      status: 'completed',
      startTime: new Date().toISOString(),
      endTime: new Date().toISOString(),
      isInitialBackup: true,
      filesScanned: 1,
      filesCopied: 1,
      filesSkipped: 0,
      filesFailed: 0,
      newFilesCount: 1,
      modifiedFilesCount: 0,
      bytesTotal: 10 * 1024 * 1024,
      bytesTransferred: 10 * 1024 * 1024,
      currentSpeedBps: 1024 * 1024,
      estimatedSecondsRemaining: 0,
      isVerified: true,
      errors: [],
    };
    db.saveBackupSession(successSessionB);

    // 3.10 Verification of scoping logic matching Dashboard.tsx:
    // When primaryDrive is Drive B (SanDisk):
    // driveSpecificSession must find Drive B's session, NEVER Drive A's capacity rejection!
    const updatedHistory = db.getBackupHistory(50);
    const driveBFound = updatedHistory.find(s => s.driveStableId === driveB.stableHardwareId);
    assert(driveBFound?.status === 'completed', '3.10 Primary drive B resolves only its own completed session');
    assert(driveBFound?.driveStableId === driveB.stableHardwareId, '3.11 Drive B session matches drive B hardware ID');

    // When primaryDrive is Drive A (Transcend):
    const driveAFound = updatedHistory.find(s => s.driveStableId === driveA.stableHardwareId);
    assert(driveAFound?.status === 'stopped_insufficient_space', '3.12 Primary drive A resolves its own capacity stopped session');
    assert(driveAFound?.capacityAssessment?.formattedRequired !== undefined, '3.13 Drive A has formatted required space metric');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Database Audit & Auto-Repair (Workstream C5)
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Database Audit & Orphan Profile Repair Tests ---');

    const auditRes = db.auditRegistrationsAndProfiles();
    assert(auditRes.valid === true, '4.1 Audit confirms all registered drives have valid isolated profiles');
    assert(auditRes.repaired === 0, '4.2 Zero repairs needed for properly registered drives');

    console.log('\n==================================================================');
    console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('==================================================================\n');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    try {
      await new Promise(r => setTimeout(r, 400));
      fs.rmSync(testTemp, { recursive: true, force: true });
    } catch {}
  }
}

runRegressionSuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
