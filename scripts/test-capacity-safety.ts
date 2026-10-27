/**
 * Dero Vault — Destination Capacity Safety Test Suite
 * 
 * Verifies preflight capacity assessment, dynamic free space calculation,
 * FAT32 single-file constraints, fail-closed handling, and live ENOSPC handling.
 */

import fs from 'fs';
import path from 'path';
import { CapacitySafetyService } from '../server/services/capacitySafety.js';
import { RemovableDrive, BackupProfile, BackupSession } from '../server/types.js';
import { PlannedFileCopy } from '../server/services/fileComparison.js';
import { ScannedFile } from '../server/services/fileScanner.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { BackupEngine } from '../server/services/backupEngine.js';

let passedTests = 0;
let failedTests = 0;

function assert(condition: boolean, testName: string, detail?: string) {
  if (condition) {
    passedTests++;
    console.log(`[PASS] ${testName}`);
  } else {
    failedTests++;
    console.error(`[FAIL] ${testName}${detail ? ` -> ${detail}` : ''}`);
  }
}

async function runCapacitySafetySuite() {
  console.log('====================================================');
  console.log('DERO VAULT — DESTINATION CAPACITY SAFETY TEST SUITE');
  console.log('====================================================\n');

  const testRoot = '/tmp/dero_capacity_test';
  if (fs.existsSync(testRoot)) {
    fs.rmSync(testRoot, { recursive: true, force: true });
  }
  fs.mkdirSync(testRoot, { recursive: true });

  const destMount = path.join(testRoot, 'mock_usb_drive');
  fs.mkdirSync(destMount, { recursive: true });

  // 1. Volume Space Query Verification
  console.log('--- 1. Volume Space Query Tests ---');
  const volumeInfo = await CapacitySafetyService.queryVolumeSpace(destMount);
  assert(volumeInfo.isReliable === true, '1.1 Real volume space query succeeds on mounted path');
  assert(volumeInfo.availableBytes > 0, '1.2 Available bytes query returns positive byte metric');
  assert(volumeInfo.totalBytes >= volumeInfo.availableBytes, '1.3 Total bytes >= available bytes');

  const missingInfo = await CapacitySafetyService.queryVolumeSpace('/path/does/not/exist/99999');
  assert(missingInfo.isReliable === false, '1.4 Missing path query marks volume info as unreliable');

  // 2. Preflight Assessment: Adequate Space
  console.log('\n--- 2. Preflight Assessment: Sufficient Space ---');
  const dummyDrive: RemovableDrive = {
    id: 'drive-test-1',
    driveLetter: 'E:',
    mountPath: destMount,
    volumeLabel: 'DERO_BACKUP',
    volumeSerial: '8A23-F41C',
    deviceModel: 'SanDisk Ultra USB 3.0',
    totalBytes: 64 * 1024 * 1024 * 1024, // 64 GB
    freeBytes: 32 * 1024 * 1024 * 1024,  // 32 GB free
    fileSystem: 'NTFS',
    isRemovable: true,
    isConnected: true,
    isRegistered: true,
    isSystemDrive: false,
    stableHardwareId: 'HW-USB-TEST-001',
  };

  const sampleScanned: ScannedFile[] = [
    {
      fullPath: '/tmp/src/doc1.pdf',
      sourceBaseFolder: '/tmp/src',
      sourceFolderName: 'src',
      relativePath: 'doc1.pdf',
      size: 5 * 1024 * 1024,
      mtimeMs: Date.now(),
    },
    {
      fullPath: '/tmp/src/doc2.pdf',
      sourceBaseFolder: '/tmp/src',
      sourceFolderName: 'src',
      relativePath: 'doc2.pdf',
      size: 15 * 1024 * 1024,
      mtimeMs: Date.now(),
    },
  ];

  const sampleToCopy: PlannedFileCopy[] = [
    {
      action: 'NEW',
      source: sampleScanned[0],
      destinationPath: path.join(destMount, 'DERO_VAULT_BACKUP/CURRENT/src/doc1.pdf'),
      size: sampleScanned[0].size,
    },
    {
      action: 'NEW',
      source: sampleScanned[1],
      destinationPath: path.join(destMount, 'DERO_VAULT_BACKUP/CURRENT/src/doc2.pdf'),
      size: sampleScanned[1].size,
    },
  ];

  const assessmentOk = await CapacitySafetyService.assessPreflight({
    toCopy: sampleToCopy,
    scannedFiles: sampleScanned,
    scanErrors: [],
    destMountPath: destMount,
    drive: dummyDrive,
    isTurbo: false,
    preserveVersions: true,
  });

  assert(assessmentOk.canProceed === true, '2.1 Preflight assessment passes when destination has ample capacity');
  assert(assessmentOk.actualDataBytes === 20 * 1024 * 1024, '2.2 Actual data bytes calculated accurately (20 MB)');
  assert(assessmentOk.totalRequiredBytes > assessmentOk.actualDataBytes, '2.3 Total required bytes includes safety margin & metadata allowances');
  assert(assessmentOk.additionalNeededBytes === 0, '2.4 Additional needed bytes is 0 for adequate drive');

  // 3. Preflight Assessment: Insufficient Space (Blink backup prevention)
  console.log('\n--- 3. Preflight Assessment: Insufficient Space Prevention ---');
  const smallDrive: RemovableDrive = {
    ...dummyDrive,
    totalBytes: 50 * 1024 * 1024, // 50 MB
    freeBytes: 10 * 1024 * 1024,  // Only 10 MB free
  };

  const hugeFile: ScannedFile = {
    fullPath: '/tmp/src/huge_video.mp4',
    sourceBaseFolder: '/tmp/src',
    sourceFolderName: 'src',
    relativePath: 'huge_video.mp4',
    size: 500 * 1024 * 1024, // 500 MB file
    mtimeMs: Date.now(),
  };

  const toCopyOversized: PlannedFileCopy[] = [
    {
      action: 'NEW',
      source: hugeFile,
      destinationPath: path.join(destMount, 'DERO_VAULT_BACKUP/CURRENT/src/huge_video.mp4'),
      size: hugeFile.size,
    },
  ];

  const assessmentOversized = await CapacitySafetyService.assessPreflight({
    toCopy: toCopyOversized,
    scannedFiles: [hugeFile],
    scanErrors: [],
    destMountPath: destMount,
    drive: smallDrive,
    isTurbo: false,
    preserveVersions: true,
  });

  assert(assessmentOversized.canProceed === false, '3.1 Preflight fails closed when required bytes exceed capacity');
  assert(assessmentOversized.reason === 'INSUFFICIENT_SPACE', '3.2 Failure reason is classified as INSUFFICIENT_SPACE');
  assert(assessmentOversized.additionalNeededBytes > 0, '3.3 Reports positive additionalNeededBytes');
  assert(assessmentOversized.message!.includes('Required space:'), '3.4 Failure message gives clear byte requirement explanation');

  // 4. Preflight Assessment: FAT32 Single-File Limit (4 GB - 1 B)
  console.log('\n--- 4. Filesystem Constraints: FAT32 File Size Limit ---');
  const fat32Drive: RemovableDrive = {
    ...dummyDrive,
    fileSystem: 'FAT32',
    totalBytes: 128 * 1024 * 1024 * 1024,
    freeBytes: 64 * 1024 * 1024 * 1024, // Plenty of total space
  };

  const giantArchive: ScannedFile = {
    fullPath: '/tmp/src/database_dump.tar',
    sourceBaseFolder: '/tmp/src',
    sourceFolderName: 'src',
    relativePath: 'database_dump.tar',
    size: 5 * 1024 * 1024 * 1024, // 5 GB file (> 4 GB FAT32 limit)
    mtimeMs: Date.now(),
  };

  const toCopyFat32Violator: PlannedFileCopy[] = [
    {
      action: 'NEW',
      source: giantArchive,
      destinationPath: path.join(destMount, 'DERO_VAULT_BACKUP/CURRENT/src/database_dump.tar'),
      size: giantArchive.size,
    },
  ];

  const assessmentFat32 = await CapacitySafetyService.assessPreflight({
    toCopy: toCopyFat32Violator,
    scannedFiles: [giantArchive],
    scanErrors: [],
    destMountPath: destMount,
    drive: fat32Drive,
    isTurbo: false,
    preserveVersions: true,
  });

  assert(assessmentFat32.canProceed === false, '4.1 Preflight rejects file > 4 GB on FAT32 destination');
  assert(assessmentFat32.reason === 'FILESYSTEM_LIMIT_FAT32', '4.2 Reason classified as FILESYSTEM_LIMIT_FAT32');
  assert(assessmentFat32.fat32Violations !== undefined && assessmentFat32.fat32Violations.length === 1, '4.3 Lists exact violating files');

  // 5. ENOSPC & Disk Full Error Classification
  console.log('\n--- 5. Disk Full Error Classification Tests ---');
  const errEnospc = new Error('ENOSPC: no space left on device, write');
  (errEnospc as any).code = 'ENOSPC';
  assert(CapacitySafetyService.isDiskFullError(errEnospc) === true, '5.1 Recognizes standard Node.js ENOSPC code');

  const errWinDiskFull = new Error('There is not enough space on the disk. (os error 112)');
  assert(CapacitySafetyService.isDiskFullError(errWinDiskFull) === true, '5.2 Recognizes Windows disk full text error');

  const errPermissions = new Error('EACCES: permission denied');
  (errPermissions as any).code = 'EACCES';
  assert(CapacitySafetyService.isDiskFullError(errPermissions) === false, '5.3 Normal I/O errors are NOT misclassified as disk-full');

  // 6. Backup Engine Integration: Preflight Capacity Block
  console.log('\n--- 6. Backup Engine Integration Tests ---');
  const dbDir = path.join(testRoot, 'test_db');
  const db = new LocalDatabase(dbDir);
  const engine = new BackupEngine(db);

  const profile: BackupProfile = {
    id: 'profile-cap-test',
    driveStableId: smallDrive.stableHardwareId,
    friendlyName: 'Test Profile',
    sourceFolders: [testRoot],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    preserveVersions: true,
    verifyBackups: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // Create a 10 MB file in the source
  const testSrcDir = path.join(testRoot, 'source_folder');
  fs.mkdirSync(testSrcDir, { recursive: true });
  fs.writeFileSync(path.join(testSrcDir, 'payload.bin'), Buffer.alloc(10 * 1024 * 1024, 'A'));
  profile.sourceFolders = [testSrcDir];

  // Run backup against smallDrive (which has 10 MB free and 50 MB total)
  const completionPromise = new Promise<BackupSession>((resolve) => {
    engine.on('session:complete', (sess: BackupSession) => {
      resolve(sess);
    });
  });

  await engine.startBackup(smallDrive, profile);
  const receivedSession: BackupSession = await completionPromise;

  assert(receivedSession !== null, '6.1 Engine emitted completion event');
  assert(
    receivedSession.status === 'stopped_insufficient_space',
    '6.2 Backup engine stopped with stopped_insufficient_space status instead of completed'
  );
  assert(receivedSession.isVerified === false, '6.3 Uncompleted session is NOT marked verified');
  assert(
    receivedSession.errors.length > 0,
    '6.4 Recorded clear capacity failure error in session report'
  );

  // Await pending async DB writes before removing directory
  await new Promise((r) => setTimeout(r, 250));
  fs.rmSync(testRoot, { recursive: true, force: true });

  console.log('\n====================================================');
  console.log(`CAPACITY SAFETY RESULTS: ${passedTests} passed, ${failedTests} failed`);
  console.log('====================================================');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runCapacitySafetySuite().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
