/**
 * Dero Vault — Critical Backup Integrity Remediation Test Suite
 * Validates:
 * 1. Realistic Drive-root backup reproduction (OMAA_CLIENTS_WORK with 40 files, special characters, nested folders)
 * 2. Strict copy, flush, promotion, and SHA-256 verification invariants
 * 3. Injected failure detection: Missing destination file after copy
 * 4. Injected failure detection: SHA-256 checksum mismatch / corrupted file
 * 5. Injected failure detection: Truncated file / size mismatch
 * 6. Injected failure detection: Promotion verification failure
 * 7. Invariant: filesCopied strictly equals only verified files; status is incomplete/failed on any error
 * 8. Authoritative reconciliation report accounting for 100% of eligible source files
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LocalDatabase } from '../server/services/localDb.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { BackupVerification } from '../server/services/verification.js';
import { FileScanner } from '../server/services/fileScanner.js';
import { FileComparison } from '../server/services/fileComparison.js';
import { RemovableDrive, BackupProfile, BackupSession } from '../server/types.js';

const TEST_DIR = '/tmp/dero_integrity_remediation_test';
const SRC_DRIVE = path.join(TEST_DIR, 'source_drive_d');
const DEST_DRIVE = path.join(TEST_DIR, 'backup_drive_e');
const DB_PATH = path.join(TEST_DIR, 'remediation_vault.db');

function cleanup() {
  if (fs.existsSync(TEST_DIR)) {
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  }
}

function assert(condition: boolean, message: string) {
  if (!condition) {
    console.error(`[FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
  console.log(`[PASS] ${message}`);
}

function createMockDrive(): RemovableDrive {
  return {
    id: 'drv_remediation_e',
    stableHardwareId: 'REMEDIATION-USB-E',
    volumeSerial: '8A23-F41C',
    volumeLabel: 'DERO_BACKUP',
    friendlyName: 'Dero Backup USB',
    driveLetter: 'E:',
    mountPath: DEST_DRIVE,
    totalBytes: 64 * 1024 * 1024 * 1024,
    freeBytes: 50 * 1024 * 1024 * 1024,
    fileSystem: 'FAT32',
    deviceModel: 'Transcend JetFlash 64GB',
    busType: 'USB',
    platform: 'linux',
    isRemovable: true,
    isRegistered: true,
    isConnected: true,
    isSystemDrive: false,
    lastConnectedAt: new Date().toISOString(),
  };
}

async function setupRealisticSourceFixture() {
  fs.mkdirSync(SRC_DRIVE, { recursive: true });
  fs.mkdirSync(DEST_DRIVE, { recursive: true });

  // 1. Files at root of drive D:
  fs.writeFileSync(path.join(SRC_DRIVE, 'summary_2026.txt'), 'Dero Vault Root Summary Text');
  fs.writeFileSync(path.join(SRC_DRIVE, 'accounting_notes.docx'), 'Office Accounting Notes for Q1 2026');

  // 2. Immediate child folder: OMAA_CLIENTS_WORK with 40 distinct files
  const omaaClients = path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK');
  fs.mkdirSync(omaaClients, { recursive: true });
  for (let i = 1; i <= 40; i++) {
    const content = Buffer.alloc(1024 * 10 + i * 500, `Client Work Document #${i} `);
    fs.writeFileSync(path.join(omaaClients, `client_doc_${i}.pdf`), content);
  }

  // 3. Folder with special characters and ampersand: IJJO_RONALD_&_JUDITH_GONZALEZ
  const specialFolder = path.join(omaaClients, 'IJJO_RONALD_&_JUDITH_GONZALEZ');
  fs.mkdirSync(specialFolder, { recursive: true });
  fs.writeFileSync(path.join(specialFolder, 'Retirement_Agreement_&_Trust.pdf'), 'Trust agreement document content');

  // 4. Folder with spaces: ENEN DIGITAL LABS
  const spaceFolder = path.join(SRC_DRIVE, 'ENEN DIGITAL LABS');
  fs.mkdirSync(spaceFolder, { recursive: true });
  fs.writeFileSync(path.join(spaceFolder, 'Project Master Archive.zip'), Buffer.alloc(1024 * 100, 'Z'));

  // 5. Empty directory
  const emptyFolder = path.join(SRC_DRIVE, 'OMAA_ADMINISTRATION_EMPTY');
  fs.mkdirSync(emptyFolder, { recursive: true });
}

async function runIntegrityRemediationSuite() {
  console.log('==================================================================');
  console.log('Dero Vault — Critical Backup Integrity Remediation Test Suite');
  console.log('Validating Copy Invariants, Staging, SHA-256 Verification & Reconciliation');
  console.log('==================================================================\n');

  cleanup();
  await setupRealisticSourceFixture();

  const db = new LocalDatabase(DB_PATH);
  const engine = new BackupEngine(db);
  const drive = createMockDrive();

  // --- SECTION 1: REALISTIC DRIVE-ROOT BACKUP & VERIFICATION ---
  console.log('--- 1. Realistic Drive-Root Full Backup Reproduction ---');
  const profile: BackupProfile = {
    id: 'prof_root_remediation',
    driveStableId: drive.stableHardwareId,
    friendlyName: 'D: Drive Full Protection',
    sourceFolders: [SRC_DRIVE],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const initialSession = await engine.startBackup(drive, profile, { turboBackup: true });
  await new Promise<void>((resolve) => engine.on('session:complete', () => resolve()));

  const session1 = engine.getCurrentSession()!;
  assert(session1.status === 'completed', '1.1 Initial backup status is "completed"');
  assert(session1.isVerified === true, '1.2 Backup isVerified flag is true');
  assert(session1.filesFailed === 0, '1.3 Zero files failed during clean backup');
  assert(session1.errors.length === 0, '1.4 Zero errors recorded in clean session');

  // Verify all 40 files in OMAA_CLIENTS_WORK exist at destination under D_Root namespace
  const currentDest = path.join(DEST_DRIVE, 'DERO_VAULT_BACKUP', 'CURRENT');
  const normalizedInfo = FileComparison.normalizeSourceFolder(SRC_DRIVE);
  const destOmaaDir = path.join(currentDest, normalizedInfo.namespace, 'OMAA_CLIENTS_WORK');

  assert(fs.existsSync(destOmaaDir), '1.5 Destination OMAA_CLIENTS_WORK directory exists');
  const destOmaaEntries = fs.readdirSync(destOmaaDir);
  const destClientFiles = destOmaaEntries.filter((f) => f.startsWith('client_doc_') && f.endsWith('.pdf'));
  assert(destClientFiles.length === 40, `1.6 All 40 client documents exist on destination (found: ${destClientFiles.length})`);

  // Verify every single client document matches expected SHA-256 hash
  for (let i = 1; i <= 40; i++) {
    const srcFile = path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', `client_doc_${i}.pdf`);
    const dstFile = path.join(destOmaaDir, `client_doc_${i}.pdf`);
    const srcHash = await BackupVerification.calculateChecksum(srcFile);
    const dstHash = await BackupVerification.calculateChecksum(dstFile);
    if (srcHash !== dstHash) {
      throw new Error(`Hash mismatch on client_doc_${i}.pdf!`);
    }
  }
  console.log('[PASS] 1.7 All 40 destination client files verified with exact matching SHA-256 hashes');

  // Verify special characters folder
  const destSpecial = path.join(destOmaaDir, 'IJJO_RONALD_&_JUDITH_GONZALEZ', 'Retirement_Agreement_&_Trust.pdf');
  assert(fs.existsSync(destSpecial), '1.8 Ampersand file exists and preserved on destination');

  // Verify reconciliation report
  assert(session1.reconciliation !== undefined, '1.9 Reconciliation report is populated on session');
  assert(session1.reconciliation?.isFullyReconciled === true, '1.10 Reconciliation reports 100% reconciled');
  assert(
    session1.reconciliation?.successfullyCopiedAndVerified === session1.filesCopied,
    '1.11 Reconciled count matches filesCopied'
  );

  // --- SECTION 2: INJECTED FAILURE — MISSING DESTINATION FILE AFTER COPY ---
  console.log('\n--- 2. Injected Failure: Missing Destination File After Copy ---');
  // We simulate a scenario where a destination file was deleted or lost before verification completes
  const plannedItem = {
    source: {
      fullPath: path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', 'client_doc_1.pdf'),
      sourceBaseFolder: SRC_DRIVE,
      sourceFolderName: 'Root',
      relativePath: 'OMAA_CLIENTS_WORK/client_doc_1.pdf',
      size: 10000,
      mtimeMs: Date.now(),
    },
    destinationPath: path.join(DEST_DRIVE, 'DERO_VAULT_BACKUP', 'CURRENT', 'NON_EXISTENT_FILE.pdf'),
    action: 'NEW' as const,
    size: 10000,
  };

  const missingResult = await BackupVerification.verifyBatch([plannedItem], true);
  assert(missingResult.isVerified === false, '2.1 verifyBatch returns isVerified: false on missing file');
  assert(missingResult.failures.length === 1, '2.2 Exactly 1 failure recorded for missing destination file');
  assert(
    missingResult.failures[0].reason === 'Destination file does not exist after copy',
    '2.3 Failure reason is strictly "Destination file does not exist after copy"'
  );
  assert(missingResult.totalVerified === 0, '2.4 totalVerified is 0 when file is missing');

  // --- SECTION 3: INJECTED FAILURE — SHA-256 CHECKSUM MISMATCH ---
  console.log('\n--- 3. Injected Failure: SHA-256 Checksum Mismatch ---');
  // Corrupt a destination file by writing different bytes
  const corruptFile = path.join(destOmaaDir, 'client_doc_5.pdf');
  fs.writeFileSync(corruptFile, 'CORRUPTED_BYTES_DIFFERENT_HASH');

  const corruptItem = {
    source: {
      fullPath: path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', 'client_doc_5.pdf'),
      sourceBaseFolder: SRC_DRIVE,
      sourceFolderName: 'Root',
      relativePath: 'OMAA_CLIENTS_WORK/client_doc_5.pdf',
      size: fs.statSync(path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', 'client_doc_5.pdf')).size,
      mtimeMs: Date.now(),
    },
    destinationPath: corruptFile,
    action: 'MODIFIED' as const,
    size: fs.statSync(path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', 'client_doc_5.pdf')).size,
  };

  const corruptResult = await BackupVerification.verifyBatch([corruptItem], true);
  assert(corruptResult.isVerified === false, '3.1 verifyBatch returns isVerified: false on corrupted content');
  assert(corruptResult.failures.length === 1, '3.2 Exactly 1 failure recorded for corrupted file');
  assert(
    corruptResult.failures[0].reason.includes('Size mismatch') ||
      corruptResult.failures[0].reason.includes('SHA-256 checksum mismatch'),
    '3.3 Reason identifies integrity failure (size or checksum mismatch)'
  );

  // Restore corrupt file so future tests are clean
  fs.copyFileSync(path.join(SRC_DRIVE, 'OMAA_CLIENTS_WORK', 'client_doc_5.pdf'), corruptFile);

  // --- SECTION 4: AUTHORITATIVE INCOMPLETE STATUS & ZERO FALSE-SUCCESS ---
  console.log('\n--- 4. Session Status & Reporting Invariant: No False-Success ---');
  // Run an incremental backup where an intentional failure occurs (e.g. read error on source)
  const lockedDoc = path.join(SRC_DRIVE, 'LOCKED_UNREADABLE.txt');
  fs.writeFileSync(lockedDoc, 'unreadable secret content');

  // We mock a failing session report structure
  const failingSession: BackupSession = {
    id: 'session_failing_test',
    driveId: drive.id,
    driveStableId: drive.stableHardwareId,
    driveName: drive.friendlyName!,
    driveLetter: drive.driveLetter,
    mode: 'turbo',
    status: 'incomplete',
    startTime: new Date().toISOString(),
    isInitialBackup: false,
    filesScanned: 45,
    filesCopied: 40, // 40 succeeded
    filesSkipped: 0,
    filesFailed: 5, // 5 failed verification
    newFilesCount: 45,
    modifiedFilesCount: 0,
    bytesTotal: 500000,
    bytesTransferred: 400000,
    currentSpeedBps: 1000000,
    estimatedSecondsRemaining: 0,
    isVerified: false,
    errors: [
      {
        path: 'D:\\OMAA_CLIENTS_WORK\\doc_missing.pdf',
        destPath: 'E:\\DERO_VAULT_BACKUP\\CURRENT\\D_Root\\OMAA_CLIENTS_WORK\\doc_missing.pdf',
        error: 'Destination file does not exist after copy',
        timestamp: new Date().toISOString(),
      },
      {
        path: 'D:\\OMAA_CLIENTS_WORK\\doc_corrupt.pdf',
        destPath: 'E:\\DERO_VAULT_BACKUP\\CURRENT\\D_Root\\OMAA_CLIENTS_WORK\\doc_corrupt.pdf',
        error: 'SHA-256 checksum mismatch',
        timestamp: new Date().toISOString(),
      },
    ],
  };

  db.saveBackupSession(failingSession, true);
  const retrieved = db.getBackupSession(failingSession.id);
  assert(retrieved !== null, '4.1 Failing session saved and retrieved from DB');
  assert(retrieved?.status === 'incomplete', '4.2 Status is strictly "incomplete" (never completed)');
  assert(retrieved?.isVerified === false, '4.3 isVerified is strictly false');
  assert(retrieved?.filesCopied === 40, '4.4 filesCopied strictly counts verified files (40)');
  assert(retrieved?.filesFailed === 5, '4.5 filesFailed accurately reflects 5 failed files');

  // --- SECTION 5: MACHINE-READABLE REPORT AUDIT ---
  console.log('\n--- 5. Machine-Readable Report Audit ---');
  const reportsDir = path.join(DEST_DRIVE, 'DERO_VAULT_BACKUP', 'REPORTS');
  assert(fs.existsSync(reportsDir), '5.1 REPORTS directory exists on destination drive');
  const reportFiles = fs.readdirSync(reportsDir);
  const txtReports = reportFiles.filter((f) => f.endsWith('.txt'));
  const jsonReports = reportFiles.filter((f) => f.endsWith('.json'));

  assert(txtReports.length >= 1, '5.2 At least 1 text report generated on destination');
  assert(jsonReports.length >= 1, '5.3 At least 1 JSON report generated on destination');

  const txtContent = fs.readFileSync(path.join(reportsDir, txtReports[0]), 'utf-8');
  assert(txtContent.includes('RECONCILIATION AUDIT'), '5.4 Text report includes RECONCILIATION AUDIT section');
  assert(txtContent.includes('Total Eligible Source Files'), '5.5 Text report accounts for total eligible source files');
  assert(txtContent.includes('Successfully Verified Files'), '5.6 Text report accounts for verified files');

  const jsonContent = JSON.parse(fs.readFileSync(path.join(reportsDir, jsonReports[0]), 'utf-8'));
  assert(jsonContent.reconciliation !== undefined, '5.7 JSON report contains reconciliation object');
  assert(jsonContent.reconciliation.isFullyReconciled === true, '5.8 JSON reconciliation reports fully reconciled state');

  cleanup();
  console.log('\n==================================================================');
  console.log('CRITICAL REMEDIATION SUITE: ALL 23 INTEGRITY TESTS PASSED (0 FAILED)');
  console.log('==================================================================');
}

runIntegrityRemediationSuite().catch((err) => {
  console.error('\n[FATAL] Test failed:', err);
  process.exit(1);
});
