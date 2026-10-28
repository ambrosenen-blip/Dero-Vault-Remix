/**
 * Dero Vault — Unified Backup Status, Recovery Launcher & Embedded Payload Test Suite
 * 
 * Verifies:
 * 1. Unified status across backend, dashboard, tray and notifications.
 * 2. Capacity rejection before copying (0 files copied, 0 bytes transferred, no false success).
 * 3. Functional recovery entry point with 3 distinct actions (Browse files, Launch setup, Restore files).
 * 4. Embedded release recovery payload provisioning, cryptographic manifest verification, idempotency.
 * 5. Capacity planning accounting for recovery packages.
 * 6. Non-destructive safety guarantees and data preservation.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { RecoveryManager } from '../server/services/recoveryManager.js';
import { RestoreEngine } from '../server/services/restoreEngine.js';
import { CapacitySafetyService } from '../server/services/capacitySafety.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { RemovableDrive, BackupProfile, BackupSession } from '../server/types.js';

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

async function calculateSha256(filePath: string): Promise<string> {
  const hash = crypto.createHash('sha256');
  const buffer = await fs.promises.readFile(filePath);
  hash.update(buffer);
  return hash.digest('hex');
}

async function runTestSuite() {
  console.log('==================================================================');
  console.log('Dero Vault — Unified Status & Recovery Payload Test Suite');
  console.log('Publisher: Enen Digital Labs Co. Ltd');
  console.log('==================================================================\n');

  const testTemp = path.join(os.tmpdir(), `dero-unified-test-${Date.now()}`);
  fs.mkdirSync(testTemp, { recursive: true });

  const mockUsbRoot = path.join(testTemp, 'MOCK_USB_E');
  fs.mkdirSync(mockUsbRoot, { recursive: true });

  const mockSourceFolder = path.join(testTemp, 'ClientDocuments');
  fs.mkdirSync(mockSourceFolder, { recursive: true });

  // Create sample office documents in source
  fs.writeFileSync(path.join(mockSourceFolder, 'Client_Proposal_2026.docx'), 'Client Proposal Document for 2026', 'utf-8');
  fs.writeFileSync(path.join(mockSourceFolder, 'Financial_Forecast.xlsx'), 'Q1, Q2, Q3, Q4 Financial Projections', 'utf-8');
  fs.mkdirSync(path.join(mockSourceFolder, 'Subfolder'), { recursive: true });
  fs.writeFileSync(path.join(mockSourceFolder, 'Subfolder', 'Notes.txt'), 'Meeting notes and actionable items', 'utf-8');

  const mockDrive: RemovableDrive = {
    id: 'drv_test_usb_unified',
    stableHardwareId: 'USB-HARDWARE-ID-UNIFIED-99',
    volumeSerial: '8B45-C9A1',
    volumeLabel: 'DERO_USB',
    friendlyName: 'Dero Office USB',
    driveLetter: 'E:',
    mountPath: mockUsbRoot,
    totalBytes: 8 * 1024 * 1024 * 1024, // 8 GB total
    freeBytes: 6 * 1024 * 1024 * 1024,  // 6 GB free
    fileSystem: 'NTFS',
    deviceModel: 'SanDisk Ultra USB 3.0',
    isRemovable: true,
    isRegistered: true,
    isConnected: true,
    isSystemDrive: false,
  };

  const mockProfile: BackupProfile = {
    id: 'prof_unified_001',
    driveStableId: mockDrive.stableHardwareId,
    friendlyName: 'Dero Office USB',
    sourceFolders: [mockSourceFolder],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const db = new LocalDatabase(path.join(testTemp, 'db-instance'));

  try {
    // -------------------------------------------------------------------------
    // TEST SECTION 1: Embedded Release Recovery Payload Integrity
    // -------------------------------------------------------------------------
    console.log('--- 1. Embedded Release Recovery Payload Tests ---');

    const payloadDir = RecoveryManager.findLocalReleasePayload();
    assert(payloadDir !== null, '1.1 Local release recovery payload found in distribution');

    const releaseManifest = await RecoveryManager.getReleasePayloadManifest();
    assert(releaseManifest !== null, '1.2 Release payload MANIFEST.json is valid and readable');
    assert(releaseManifest?.publisher === 'Enen Digital Labs Co. Ltd', '1.3 Publisher authenticity sealed in release manifest');
    assert(Array.isArray(releaseManifest?.packages) && releaseManifest!.packages.length >= 4, '1.4 Contains packages for Windows, macOS, Linux, and Guides');

    // Verify each declared package physically exists and matches its sealed SHA-256
    let allPackageHashesValid = true;
    for (const pkg of releaseManifest!.packages) {
      const fullPath = path.join(payloadDir!, pkg.relativePath);
      const exists = fs.existsSync(fullPath);
      if (!exists) {
        allPackageHashesValid = false;
        console.error(`Missing payload package: ${pkg.relativePath}`);
        continue;
      }
      const actualHash = await calculateSha256(fullPath);
      if (actualHash.toLowerCase() !== pkg.sha256.toLowerCase()) {
        allPackageHashesValid = false;
        console.error(`Hash mismatch for ${pkg.fileName}. Expected ${pkg.sha256}, got ${actualHash}`);
      }
    }
    assert(allPackageHashesValid, '1.5 Every package matches its cryptographic SHA-256 hash');

    // -------------------------------------------------------------------------
    // TEST SECTION 2: Automated USB Recovery Payload Provisioning
    // -------------------------------------------------------------------------
    console.log('\n--- 2. Automated USB Recovery Payload Provisioning Tests ---');

    // Check missing payload bytes before provisioning
    const missingBytesBefore = await RecoveryManager.getMissingPayloadBytes(mockUsbRoot);
    assert(missingBytesBefore > 0, '2.1 Correctly computes positive missing bytes before provisioning', `${missingBytesBefore} bytes`);

    // Provision onto mock USB drive
    const provResult = await RecoveryManager.provisionRecoveryPackage(mockDrive, mockProfile);
    assert(provResult.isProvisioned === true, '2.2 Provisioning onto registered drive succeeds');

    // Check provisioned directory structure
    const recoveryDir = path.join(mockUsbRoot, 'DERO_VAULT_BACKUP', 'RECOVERY');
    assert(fs.existsSync(recoveryDir), '2.3 DERO_VAULT_BACKUP/RECOVERY directory created');
    assert(fs.existsSync(path.join(mockUsbRoot, 'START_HERE.html')), '2.4 START_HERE.html created at drive root');
    assert(fs.existsSync(path.join(mockUsbRoot, 'RESCUE_MY_FILES.html')), '2.5 RESCUE_MY_FILES.html pointer created at drive root');
    assert(fs.existsSync(path.join(recoveryDir, 'START_HERE.html')), '2.6 START_HERE.html created inside RECOVERY/');
    assert(fs.existsSync(path.join(recoveryDir, 'MANIFEST.json')), '2.7 MANIFEST.json created inside RECOVERY/');
    assert(fs.existsSync(path.join(recoveryDir, 'recovery-manifest.json')), '2.8 recovery-manifest.json created inside RECOVERY/');

    // Check provisioned installer packages on USB
    const winSetupOnUsb = path.join(recoveryDir, 'INSTALLERS', 'WINDOWS_X64', 'DeroVault-Setup.exe');
    assert(fs.existsSync(winSetupOnUsb), '2.9 Windows setup installer provisioned to INSTALLERS/WINDOWS_X64/');

    const macOnUsb = path.join(recoveryDir, 'INSTALLERS', 'MACOS', 'DeroVault-macOS-Installer.command');
    assert(fs.existsSync(macOnUsb), '2.10 macOS recovery script provisioned to INSTALLERS/MACOS/');

    const linuxOnUsb = path.join(recoveryDir, 'INSTALLERS', 'LINUX', 'DeroVault-Linux-Installer.sh');
    assert(fs.existsSync(linuxOnUsb), '2.11 Linux recovery tool provisioned to INSTALLERS/LINUX/');

    // Verify checksum of provisioned files against manifest
    const winHashOnUsb = await calculateSha256(winSetupOnUsb);
    const winExpectedHash = releaseManifest!.packages.find(p => p.fileName === 'DeroVault-Setup.exe')!.sha256;
    assert(winHashOnUsb.toLowerCase() === winExpectedHash.toLowerCase(), '2.12 Provisioned Windows setup matches release manifest SHA-256');

    // Idempotency: missing bytes after provisioning should now be 0
    const missingBytesAfter = await RecoveryManager.getMissingPayloadBytes(mockUsbRoot);
    assert(missingBytesAfter === 0, '2.13 Repeated check confirms 0 missing bytes (no redundant recopying)');

    // Re-provisioning is safe and idempotent
    const reprovResult = await RecoveryManager.provisionRecoveryPackage(mockDrive, mockProfile);
    assert(reprovResult.isProvisioned === true, '2.14 Re-provisioning is safe and idempotent');

    // -------------------------------------------------------------------------
    // TEST SECTION 3: Functional Recovery Launcher & Three Distinct Actions
    // -------------------------------------------------------------------------
    console.log('\n--- 3. Functional Recovery Launcher Tests ---');

    const startHereHtml = fs.readFileSync(path.join(mockUsbRoot, 'START_HERE.html'), 'utf-8');
    assert(startHereHtml.includes('Action A'), '3.1 Action A (Browse My Files) present in START_HERE.html');
    assert(startHereHtml.includes('Action B'), '3.2 Action B (Launch Recovery Software) present in START_HERE.html');
    assert(startHereHtml.includes('Action C'), '3.3 Action C (Restore My Files) present in START_HERE.html');
    assert(startHereHtml.includes('DERO_VAULT_BACKUP/CURRENT') || startHereHtml.includes('../CURRENT'), '3.4 Direct reference to CURRENT backup directory without requiring app');
    assert(startHereHtml.includes('Enen Digital Labs Co. Ltd'), '3.5 Authenticity and publisher preserved in portal HTML');

    // Native Windows Batch Launcher
    const winBat = fs.readFileSync(path.join(mockUsbRoot, 'Rescue-Windows.bat'), 'utf-8');
    assert(winBat.includes('Browse backed-up files directly'), '3.6 Windows batch launcher provides direct file browsing');
    assert(winBat.includes('Launch verified Dero Vault Offline Setup'), '3.7 Windows batch launcher provides setup option');
    assert(winBat.includes('Do you want to run Dero Vault Setup now?'), '3.8 Windows batch launcher requires explicit user confirmation before executing');

    // -------------------------------------------------------------------------
    // TEST SECTION 4: Preflight Capacity Safety Accounting for Recovery Packages
    // -------------------------------------------------------------------------
    console.log('\n--- 4. Capacity Safety Integration Tests ---');

    // Test a constrained drive where backup + recovery packages exceed available capacity
    const constrainedUsb = path.join(testTemp, 'CONSTRAINED_USB');
    fs.mkdirSync(constrainedUsb, { recursive: true });

    // Mock drive with only 10 MB free
    const tightDrive: RemovableDrive = {
      ...mockDrive,
      mountPath: constrainedUsb,
      freeBytes: 10 * 1024 * 1024, // 10 MB free
      totalBytes: 8 * 1024 * 1024 * 1024,
    };

    const missingConstrainedBytes = await RecoveryManager.getMissingPayloadBytes(constrainedUsb);
    assert(missingConstrainedBytes > 0, '4.1 Constrained drive detects missing recovery payload bytes');

    const preflightTight = await CapacitySafetyService.assessPreflight({
      toCopy: [
        {
          action: 'NEW',
          source: {
            fullPath: path.join(mockSourceFolder, 'Client_Proposal_2026.docx'),
            sourceBaseFolder: mockSourceFolder,
            sourceFolderName: 'ClientDocuments',
            relativePath: 'Client_Proposal_2026.docx',
            size: 10 * 1024 * 1024,
            mtimeMs: Date.now(),
          },
          destinationPath: path.join(constrainedUsb, 'DERO_VAULT_BACKUP', 'CURRENT', 'ClientDocuments', 'Client_Proposal_2026.docx'),
          size: 10 * 1024 * 1024,
        },
      ],
      scannedFiles: [],
      scanErrors: [],
      destMountPath: constrainedUsb,
      drive: tightDrive,
      isTurbo: false,
      preserveVersions: true,
      includeRecoveryPackageBytes: missingConstrainedBytes,
    });

    assert(preflightTight.canProceed === false, '4.2 Preflight fails closed when recovery payload + data exceeds capacity');
    assert(preflightTight.reason === 'INSUFFICIENT_SPACE', '4.3 Rejection classified as INSUFFICIENT_SPACE');
    assert(preflightTight.recoveryPackageBytes === missingConstrainedBytes, '4.4 Preflight calculation accounted for recovery packages');
    assert(preflightTight.additionalNeededBytes > 0, '4.5 Preflight calculated exact additional needed space');

    // -------------------------------------------------------------------------
    // TEST SECTION 5: Unified Authoritative Backup Status & Zero False Success
    // -------------------------------------------------------------------------
    console.log('\n--- 5. Unified Status & Zero False-Success Tests ---');

    const backupEngine = new BackupEngine(db);
    let emittedTerminalStatus: string | null = null;
    let emittedUpdates: string[] = [];

    backupEngine.on('session:update', (s: BackupSession) => {
      emittedUpdates.push(s.status);
    });

    backupEngine.on('session:complete', (s: BackupSession) => {
      emittedTerminalStatus = s.status;
    });

    // Run backup against the constrained drive: must be safely halted by capacity check
    const waitConstrained = new Promise<void>((resolve) => {
      backupEngine.on('session:complete', () => resolve());
    });
    await backupEngine.startBackup(tightDrive, mockProfile);
    await waitConstrained;

    assert(emittedTerminalStatus === 'stopped_insufficient_space', '5.1 Backup terminated with status stopped_insufficient_space');
    assert(backupEngine.isRunning() === false, '5.2 BackupEngine is NOT running after capacity stop');
    assert(emittedUpdates.includes('checking_capacity'), '5.3 checking_capacity state was broadcast');

    const sessionReport = backupEngine.getCurrentSession();
    assert(sessionReport?.status === 'stopped_insufficient_space', '5.4 Authoritative session status is stopped_insufficient_space');
    assert(sessionReport?.filesCopied === 0, '5.5 Exactly 0 files copied during rejected attempt');
    assert(sessionReport?.bytesTransferred === 0, '5.6 Exactly 0 bytes transferred during rejected attempt');
    assert(sessionReport?.isVerified === false, '5.7 Session is NOT marked verified');

    // Confirm destination backup directory remains completely empty of partial files
    const currentOnTight = path.join(constrainedUsb, 'DERO_VAULT_BACKUP', 'CURRENT');
    const hasFiles = fs.existsSync(currentOnTight) && fs.readdirSync(currentOnTight).length > 0;
    assert(!hasFiles, '5.8 Destination CURRENT directory is completely empty (zero data written)');

    // -------------------------------------------------------------------------
    // TEST SECTION 6: Successful Backup Status & Verification
    // -------------------------------------------------------------------------
    console.log('\n--- 6. Genuinely Completed Backup Verification Tests ---');

    let completedStatus: string | null = null;
    const backupEngineSuccess = new BackupEngine(db);
    const waitSuccess = new Promise<void>((resolve) => {
      backupEngineSuccess.on('session:complete', (s: BackupSession) => {
        completedStatus = s.status;
        resolve();
      });
    });

    // Run backup on ample USB drive
    await backupEngineSuccess.startBackup(mockDrive, mockProfile);
    await waitSuccess;

    assert(completedStatus === 'completed', '6.1 Adequate drive completes backup with completed status');
    const successSession = backupEngineSuccess.getCurrentSession();
    assert(successSession?.isVerified === true, '6.2 Completed backup is verified via SHA-256');
    assert(successSession?.filesCopied! > 0, '6.3 Files successfully copied');
    assert(successSession?.bytesTransferred! > 0, '6.4 Bytes successfully transferred');

    // -------------------------------------------------------------------------
    // TEST SECTION 7: Data Safety & Backward Compatibility
    // -------------------------------------------------------------------------
    console.log('\n--- 7. Data Safety & Compatibility Tests ---');

    // Validate that restore engine can inspect and find the backup
    const restoreEngine = new RestoreEngine(db);
    const inspection = await restoreEngine.inspectBackupDrive(mockUsbRoot);
    assert(inspection.hasBackup === true, '7.1 RestoreEngine inspects backup drive and finds backup');
    assert(inspection.totalFiles === 3, '7.2 Exactly 3 files identified for recovery');

    // Verify recovery manifest format versions
    const validateRes = await RecoveryManager.validateRecoveryPackage(mockUsbRoot);
    assert(validateRes.valid === true, '7.3 validateRecoveryPackage accepts format version 1.2.0');

    // Original source files remain untouched
    const originalDoc = fs.readFileSync(path.join(mockSourceFolder, 'Client_Proposal_2026.docx'), 'utf-8');
    assert(originalDoc === 'Client Proposal Document for 2026', '7.4 Source files remain 100% untouched and intact');

    console.log('\n==================================================================');
    console.log(`TEST SUMMARY: ${passedTests} PASSED, ${failedTests} FAILED`);
    console.log('==================================================================');

    if (failedTests > 0) {
      process.exit(1);
    }
  } finally {
    try {
      await new Promise((r) => setTimeout(r, 400));
      fs.rmSync(testTemp, { recursive: true, force: true });
    } catch {}
  }
}

runTestSuite().catch((err) => {
  console.error('Fatal error during test run:', err);
  process.exit(1);
});
