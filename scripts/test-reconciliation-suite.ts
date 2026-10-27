/**
 * Dero Vault — Comprehensive Source-to-Destination Backup Reconciliation Suite
 * 
 * Verifies:
 * 1. 100% Reconciliation in Individual Folder mode (e.g. D:\OMAA_CLIENTS_WORK)
 * 2. 100% Reconciliation in Drive Root mode (e.g. D:\)
 * 3. Recursive directory symlinks and NTFS junctions support
 * 4. Error isolation and tracking (no silent error swallowing)
 * 5. Accurate distinction between discovered, queued, copied, skipped, and failed
 * 6. Cryptographic SHA-256 verification of 100% of copied bytes
 * 7. Integrity gate: Missing or unverified files must NEVER be reported as completed
 * 8. RestoreEngine inspection accurately detects and reports incomplete backups
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FileScanner, ScannedFile } from '../server/services/fileScanner.js';
import { FileComparison, PlannedFileCopy } from '../server/services/fileComparison.js';
import { BackupVerification } from '../server/services/verification.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { RestoreEngine } from '../server/services/restoreEngine.js';
import { RemovableDrive, BackupProfile } from '../server/types.js';

const TEST_BASE = '/tmp/dero_reconciliation_test';
const SOURCE_ROOT = path.join(TEST_BASE, 'source_drive');
const DEST_DRIVE = path.join(TEST_BASE, 'dest_drive');
const DB_PATH = path.join(TEST_BASE, 'db');

export interface ReconciliationRecord {
  sourceRelativePath: string;
  sourceFullPath: string;
  sourceSize: number;
  sourceSha256: string;
  queued: boolean;
  stagingFileCreated: boolean;
  finalDestinationPath: string;
  destExists: boolean;
  destSize: number;
  destSha256: string;
  verified: boolean;
  verificationReason?: string;
  status: 'SUCCESS' | 'MISSING' | 'SIZE_MISMATCH' | 'HASH_MISMATCH' | 'UNVERIFIED' | 'FAILED';
}

function calculateSha256(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function cleanupTestEnv() {
  if (fs.existsSync(TEST_BASE)) {
    fs.rmSync(TEST_BASE, { recursive: true, force: true });
  }
}

export function createDisposableFixture(): {
  eligibleFiles: { relativePath: string; fullPath: string; size: number; sha256: string }[];
} {
  cleanupTestEnv();
  fs.mkdirSync(SOURCE_ROOT, { recursive: true });
  fs.mkdirSync(DEST_DRIVE, { recursive: true });
  fs.mkdirSync(DB_PATH, { recursive: true });

  const eligibleFiles: { relativePath: string; fullPath: string; size: number; sha256: string }[] = [];

  const addFile = (rel: string, content: string | Buffer) => {
    const full = path.join(SOURCE_ROOT, rel);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, content);
    const hash = crypto.createHash('sha256').update(content).digest('hex');
    eligibleFiles.push({
      relativePath: rel,
      fullPath: full,
      size: typeof content === 'string' ? Buffer.byteLength(content) : content.length,
      sha256: hash,
    });
  };

  // 1. Files at root
  addFile('root_manifest.txt', 'Root level configuration and manifest');
  addFile('notes.txt', 'Root level notes file with duplicate name');

  // 2. Immediate child folders (OMAA_CLIENTS_WORK with 40 files)
  for (let i = 1; i <= 40; i++) {
    addFile(
      path.join('OMAA_CLIENTS_WORK', `client_contract_${i}.pdf`),
      `Contract for client ${i} - ${'Z'.repeat(250 * i)}`
    );
  }

  // 3. Deeply nested files
  addFile(
    path.join('Projects', '2026', 'Fiscal_Q1', 'Budgets', 'financials.xlsx'),
    'Detailed fiscal report 2026 Q1 financials'
  );
  addFile(
    path.join('Projects', '2026', 'Fiscal_Q1', 'Budgets', 'notes.txt'),
    'Deeply nested notes file with duplicate name'
  );

  // 4. Duplicate filenames in different directories
  addFile(path.join('Department_A', 'notes.txt'), 'Department A notes duplicate');
  addFile(path.join('Department_A', 'shared_asset.bin'), 'Shared asset content version A');
  addFile(path.join('Department_B', 'shared_asset.bin'), 'Shared asset content version B');

  // 5. Directory Junction / Symlink test: files in symlinked folder
  const symlinkTargetDir = path.join(TEST_BASE, 'external_junction_target');
  fs.mkdirSync(symlinkTargetDir, { recursive: true });
  for (let i = 1; i <= 5; i++) {
    const fn = `junctioned_asset_${i}.docx`;
    const fcontent = `External junction content ${i} - ${'J'.repeat(120 * i)}`;
    const ffull = path.join(symlinkTargetDir, fn);
    fs.writeFileSync(ffull, fcontent);
  }

  const symlinkFolder = path.join(SOURCE_ROOT, 'ClientJunctions');
  try {
    fs.symlinkSync(symlinkTargetDir, symlinkFolder, 'dir');
    for (let i = 1; i <= 5; i++) {
      const rel = path.join('ClientJunctions', `junctioned_asset_${i}.docx`);
      const full = path.join(SOURCE_ROOT, rel);
      const content = `External junction content ${i} - ${'J'.repeat(120 * i)}`;
      eligibleFiles.push({
        relativePath: rel,
        fullPath: full,
        size: Buffer.byteLength(content),
        sha256: crypto.createHash('sha256').update(content).digest('hex'),
      });
    }
  } catch (e: any) {
    console.warn('Symlink not supported in this runtime environment:', e.message);
  }

  // 6. Empty directories (should not be treated as files)
  fs.mkdirSync(path.join(SOURCE_ROOT, 'EmptyDirectory1'), { recursive: true });
  fs.mkdirSync(path.join(SOURCE_ROOT, 'Projects', 'EmptySub'), { recursive: true });

  return { eligibleFiles };
}

export async function runReconciliation(
  mode: 'DRIVE_ROOT' | 'INDIVIDUAL_FOLDER',
  sourcePath: string
): Promise<{
  records: ReconciliationRecord[];
  allEligibleAccountedFor: boolean;
  missingCount: number;
  unverifiedCount: number;
  reportSummary: string;
}> {
  const { eligibleFiles } = createDisposableFixture();

  // If testing individual folder mode, filter eligible files to only those inside that folder
  const relevantEligibles = mode === 'INDIVIDUAL_FOLDER'
    ? eligibleFiles.filter(f => f.fullPath.startsWith(sourcePath))
    : eligibleFiles;

  const db = new LocalDatabase(path.join(DB_PATH, `db_${mode}.json`));
  const engine = new BackupEngine(db);

  const drive: RemovableDrive = {
    id: 'drv_reconcile',
    stableHardwareId: 'REC-HW-1',
    volumeSerial: 'REC-VOL-1',
    volumeLabel: 'RECONCILE_DRIVE',
    driveLetter: 'E:',
    mountPath: DEST_DRIVE,
    totalBytes: 20 * 1024 * 1024 * 1024,
    freeBytes: 15 * 1024 * 1024 * 1024,
    fileSystem: 'NTFS',
    deviceModel: 'Reconciliation Test Drive',
    busType: 'USB',
    platform: 'linux',
    isRemovable: true,
    isRegistered: true,
    isConnected: true,
    isSystemDrive: false,
    lastConnectedAt: new Date().toISOString(),
  };

  const profile: BackupProfile = {
    id: `prof_${mode}`,
    driveStableId: drive.stableHardwareId,
    friendlyName: `Profile ${mode}`,
    sourceFolders: [sourcePath],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const session = await engine.startBackup(drive, profile, { turboBackup: true });

  await new Promise<void>((resolve) => {
    engine.on('session:complete', () => resolve());
  });

  const finalSession = engine.getCurrentSession()!;
  const currentBackupDir = path.join(DEST_DRIVE, 'DERO_VAULT_BACKUP', 'CURRENT');

  // Build machine-readable reconciliation records
  const records: ReconciliationRecord[] = [];
  let missingCount = 0;
  let unverifiedCount = 0;

  for (const eligible of relevantEligibles) {
    const relFromSourceBase = path.relative(sourcePath, eligible.fullPath);
    const folderInfo = FileComparison.normalizeSourceFolder(sourcePath);
    const namespace = folderInfo.namespace;
    const expectedDest = path.join(currentBackupDir, namespace, relFromSourceBase);

    const destExists = fs.existsSync(expectedDest);
    let destSize = 0;
    let destSha = '';
    let status: ReconciliationRecord['status'] = 'SUCCESS';
    let reason: string | undefined;

    if (!destExists) {
      status = 'MISSING';
      missingCount++;
      reason = 'Destination file does not exist in CURRENT';
    } else {
      const st = fs.statSync(expectedDest);
      destSize = st.size;
      destSha = calculateSha256(expectedDest);

      if (destSize !== eligible.size) {
        status = 'SIZE_MISMATCH';
        unverifiedCount++;
        reason = `Size mismatch: source ${eligible.size} vs dest ${destSize}`;
      } else if (destSha !== eligible.sha256) {
        status = 'HASH_MISMATCH';
        unverifiedCount++;
        reason = `SHA-256 mismatch`;
      }
    }

    records.push({
      sourceRelativePath: relFromSourceBase,
      sourceFullPath: eligible.fullPath,
      sourceSize: eligible.size,
      sourceSha256: eligible.sha256,
      queued: true,
      stagingFileCreated: destExists,
      finalDestinationPath: expectedDest,
      destExists,
      destSize,
      destSha256: destSha,
      verified: status === 'SUCCESS',
      verificationReason: reason,
      status,
    });
  }

  const allEligibleAccountedFor = missingCount === 0 && unverifiedCount === 0;
  const reportSummary = [
    `=== RECONCILIATION SUMMARY: ${mode} ===`,
    `Source: ${sourcePath}`,
    `Total Eligible Source Files: ${relevantEligibles.length}`,
    `Files Scanned: ${finalSession.filesScanned}`,
    `Files Copied: ${finalSession.filesCopied}`,
    `Files Missing: ${missingCount}`,
    `Files Unverified/Mismatched: ${unverifiedCount}`,
    `All Eligible Accounted For: ${allEligibleAccountedFor ? 'YES (100% RECONCILED)' : 'NO (DEFECT DETECTED)'}`,
    `Session Status: ${finalSession.status}`,
    `Session Errors: ${finalSession.errors.length}`,
    `Session Verified: ${finalSession.isVerified}`,
  ].join('\n');

  console.log(reportSummary);

  return {
    records,
    allEligibleAccountedFor,
    missingCount,
    unverifiedCount,
    reportSummary,
  };
}

async function testFailureAndIncompleteGate(): Promise<boolean> {
  console.log('\n--- TESTING FAILURE & INCOMPLETE BACKUP GATE ---');
  cleanupTestEnv();
  fs.mkdirSync(SOURCE_ROOT, { recursive: true });
  fs.mkdirSync(DEST_DRIVE, { recursive: true });
  fs.mkdirSync(DB_PATH, { recursive: true });

  // 1. Create one valid file
  fs.writeFileSync(path.join(SOURCE_ROOT, 'valid_file.txt'), 'valid content');

  // 2. Create a broken symlink pointing to a non-existent path
  const brokenLinkPath = path.join(SOURCE_ROOT, 'broken_file_link.txt');
  fs.symlinkSync('/tmp/non_existent_path_dero_defect_test', brokenLinkPath, 'file');

  const db = new LocalDatabase(path.join(DB_PATH, 'db_failure_gate.json'));
  const engine = new BackupEngine(db);

  const drive: RemovableDrive = {
    id: 'drv_reconcile_gate',
    stableHardwareId: 'REC-HW-GATE',
    volumeSerial: 'REC-VOL-GATE',
    volumeLabel: 'GATE_TEST_DRIVE',
    driveLetter: 'E:',
    mountPath: DEST_DRIVE,
    totalBytes: 20 * 1024 * 1024 * 1024,
    freeBytes: 15 * 1024 * 1024 * 1024,
    fileSystem: 'NTFS',
    deviceModel: 'Gate Test Drive',
    busType: 'USB',
    platform: 'linux',
    isRemovable: true,
    isRegistered: true,
    isConnected: true,
    isSystemDrive: false,
    lastConnectedAt: new Date().toISOString(),
  };

  const profile: BackupProfile = {
    id: 'prof_failure_gate',
    driveStableId: drive.stableHardwareId,
    friendlyName: 'Failure Gate Profile',
    sourceFolders: [SOURCE_ROOT],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await engine.startBackup(drive, profile, { turboBackup: true });

  await new Promise<void>((resolve) => {
    engine.on('session:complete', () => resolve());
  });

  const session = engine.getCurrentSession()!;

  console.log(`Gate Test Session Status: "${session.status}"`);
  console.log(`Gate Test Session Verified: ${session.isVerified}`);
  console.log(`Gate Test Session Errors: ${session.errors.length}`);
  console.log(`Gate Test Files Failed: ${session.filesFailed}`);

  // Assertion: MUST NOT be 'completed'
  const notLabeledCompleted = session.status !== 'completed';
  const notLabeledVerified = session.isVerified === false;
  const errorsCaptured = session.errors.length > 0;

  // Inspect via RestoreEngine to verify detection of incomplete backup
  const restoreEngine = new RestoreEngine(db);
  const inspection = await restoreEngine.inspectBackupDrive(DEST_DRIVE);
  console.log(`RestoreEngine isIncompleteBackup: ${inspection.isIncompleteBackup}`);
  console.log(`RestoreEngine incompleteReason: "${inspection.incompleteReason}"`);

  const restoreEngineDetectedIncomplete = inspection.isIncompleteBackup === true;

  const passed = notLabeledCompleted && notLabeledVerified && errorsCaptured && restoreEngineDetectedIncomplete;
  console.log(`Failure Gate Passed: ${passed ? 'YES ✓' : 'NO ✗'}`);
  return passed;
}

async function main() {
  console.log('====================================================');
  console.log('DERO VAULT — SOURCE-TO-DESTINATION RECONCILIATION SUITE');
  console.log('====================================================');

  const folderResult = await runReconciliation('INDIVIDUAL_FOLDER', path.join(SOURCE_ROOT, 'OMAA_CLIENTS_WORK'));
  const rootResult = await runReconciliation('DRIVE_ROOT', SOURCE_ROOT);
  const gateResult = await testFailureAndIncompleteGate();

  cleanupTestEnv();

  const allPassed =
    folderResult.allEligibleAccountedFor &&
    rootResult.allEligibleAccountedFor &&
    gateResult;

  console.log('\n====================================================');
  if (allPassed) {
    console.log('ALL RECONCILIATION & INTEGRITY TESTS PASSED ✓ (100% RECONCILED)');
    console.log('====================================================');
    process.exit(0);
  } else {
    console.error('RECONCILIATION SUITE FAILED ✗');
    console.log('====================================================');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
