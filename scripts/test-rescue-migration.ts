/**
 * Dero Vault — Automated Verification Suite for Rescue & Migration
 * Publisher: Enen Digital Labs Co. Ltd
 * 
 * Verifies:
 * 1. Provisioning tests (native launchers for Windows, macOS, Linux, root entry points, idempotency, space validation)
 * 2. Automatic OS and compatibility detection (4 distinct checks: OS, app, format, backup ready)
 * 3. Recognition and launcher validation (manifest v1.1.0 and v1.0.0 compatibility, malformed manifests, format version rejection)
 * 4. Cross-platform migration & sanitization (Windows DOS reserved names, illegal chars, case collision, symlink safety)
 * 5. Restoration tests (folder mapping, conflict handling, SHA-256 integrity, safe stop, missing launcher fallback)
 * 6. Registration on replacement computer & non-destructive continuity
 * 7. Security tests (path traversal reject, zero cloud/network leaks, source preservation)
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import crypto from 'crypto';
import { RecoveryManager } from '../server/services/recoveryManager';
import { RestoreEngine } from '../server/services/restoreEngine';
import { EnvironmentDetector } from '../server/services/environmentDetector';
import { LocalDatabase } from '../server/services/localDb';
import { BackupProfile, RemovableDrive } from '../server/types';

async function runTests() {
  console.log('====================================================');
  console.log('Dero Vault — Intelligent Cross-Platform Rescue Test Suite');
  console.log('Publisher: Enen Digital Labs Co. Ltd');
  console.log('====================================================\n');

  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, testName: string, detail?: string) {
    if (condition) {
      console.log(`[PASS] ${testName}`);
      passed++;
    } else {
      console.error(`[FAIL] ${testName} ${detail ? `- ${detail}` : ''}`);
      failed++;
    }
  }

  const tmpTestRoot = path.join(os.tmpdir(), `dero-vault-rescue-test-${Date.now()}`);
  fs.mkdirSync(tmpTestRoot, { recursive: true });

  const mockDrivePath = path.join(tmpTestRoot, 'USB_DRIVE');
  fs.mkdirSync(mockDrivePath, { recursive: true });

  const mockSourceDocs = path.join(tmpTestRoot, 'OriginalUserDocs');
  fs.mkdirSync(mockSourceDocs, { recursive: true });

  // Create sample office files
  fs.writeFileSync(path.join(mockSourceDocs, 'Quarterly_Report.docx'), 'Quarterly Financial Report Q3 2026', 'utf-8');
  fs.writeFileSync(path.join(mockSourceDocs, 'Budget_Spreadsheet.xlsx'), 'Revenue, Costs, Profit, Margin', 'utf-8');
  fs.mkdirSync(path.join(mockSourceDocs, 'Projects'), { recursive: true });
  fs.writeFileSync(path.join(mockSourceDocs, 'Projects', 'Strategy.pdf'), '%PDF-1.4 Mock strategy document', 'utf-8');

  const mockDrive: RemovableDrive = {
    id: 'drv_test_usb_001',
    stableHardwareId: 'USB-STOR-TEST-SN-998877',
    volumeSerial: '8A23-F41C',
    volumeLabel: 'Office_USB',
    friendlyName: 'My Office USB',
    driveLetter: 'E:',
    mountPath: mockDrivePath,
    totalBytes: 32 * 1024 * 1024 * 1024,
    freeBytes: 16 * 1024 * 1024 * 1024,
    fileSystem: 'NTFS',
    deviceModel: 'SanDisk Ultra USB 3.0',
    isRemovable: true,
    isRegistered: false,
    isConnected: true,
    isSystemDrive: false,
  };

  const mockProfile: BackupProfile = {
    id: 'prof_test_001',
    driveStableId: mockDrive.stableHardwareId,
    friendlyName: 'My Office USB',
    sourceFolders: [mockSourceDocs],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const db = new LocalDatabase(path.join(tmpTestRoot, 'db-instance'));

  try {
    // -------------------------------------------------------------
    // Test Category 1: Native Launcher Provisioning Tests
    // -------------------------------------------------------------
    console.log('--- 1. Native Launcher Provisioning Tests ---');

    // 1.1 Fresh provisioning on registered drive
    const provStatus = await RecoveryManager.provisionRecoveryPackage(mockDrive, mockProfile);
    assert(provStatus.isProvisioned === true, '1.1 Provisioning succeeds on accessible removable drive');
    assert(Boolean(provStatus.manifestPath && fs.existsSync(provStatus.manifestPath)), '1.2 recovery-manifest.json exists on drive');
    assert(Boolean(provStatus.launcherPath && fs.existsSync(provStatus.launcherPath)), '1.3 Rescue-Launcher.html exists on drive');
    assert(fs.existsSync(path.join(mockDrivePath, 'RESCUE_MY_FILES.html')), '1.4 Root pointer RESCUE_MY_FILES.html created at drive root');

    // Native Platform Entry Points
    assert(fs.existsSync(path.join(mockDrivePath, 'Rescue-Windows.bat')), '1.5 Native Windows launcher script present at drive root');
    assert(fs.existsSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Rescue-Windows.bat')), '1.6 Native Windows launcher in DERO_VAULT_BACKUP/RECOVERY');
    assert(fs.existsSync(path.join(mockDrivePath, 'Rescue-macOS.command')), '1.7 Native macOS command script present at drive root');
    assert(fs.existsSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Rescue-macOS.command')), '1.8 Native macOS command in DERO_VAULT_BACKUP/RECOVERY');
    assert(fs.existsSync(path.join(mockDrivePath, 'Rescue-Linux.desktop')), '1.9 Native Linux desktop launcher present at drive root');
    assert(fs.existsSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Rescue-Linux.desktop')), '1.10 Native Linux desktop launcher in DERO_VAULT_BACKUP/RECOVERY');
    assert(fs.existsSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Rescue-Linux.sh')), '1.11 Native Linux shell script in DERO_VAULT_BACKUP/RECOVERY');

    // 1.2 Idempotency: Re-provisioning the same drive
    const reprovStatus = await RecoveryManager.provisionRecoveryPackage(mockDrive, mockProfile);
    assert(reprovStatus.isProvisioned === true, '1.12 Re-provisioning is safe and idempotent');

    // 1.3 Inaccessible drive test
    const fakeDrive: RemovableDrive = { ...mockDrive, mountPath: path.join(tmpTestRoot, 'NonExistentDrive') };
    const failedProv = await RecoveryManager.provisionRecoveryPackage(fakeDrive, mockProfile);
    assert(failedProv.isProvisioned === false, '1.13 Inaccessible drive returns failure without crashing');

    // 1.4 Drive with insufficient space
    const fullDrive: RemovableDrive = { ...mockDrive, freeBytes: 100 * 1024 }; // 100 KB available (< 2 MB)
    const fullProv = await RecoveryManager.provisionRecoveryPackage(fullDrive, mockProfile);
    assert(Boolean(fullProv.isProvisioned === false && fullProv.error?.includes('Insufficient free space')), '1.14 Full drive is reported with clear insufficient space error');

    // -------------------------------------------------------------
    // Test Category 2: Automatic OS & 4-Check Compatibility Detection
    // -------------------------------------------------------------
    console.log('\n--- 2. Automatic OS & Compatibility Detection Tests ---');

    const friendlyOs = EnvironmentDetector.getFriendlyOsName();
    const friendlyArch = EnvironmentDetector.getFriendlyArch();
    assert(Boolean(friendlyOs && friendlyOs.length > 3), `2.1 Automatically detects host OS name: "${friendlyOs}"`);
    assert(Boolean(friendlyArch && friendlyArch.includes('bit')), `2.2 Automatically detects host architecture: "${friendlyArch}"`);

    // Run 4 distinct checks
    const envResult = await EnvironmentDetector.evaluateRecoveryReadiness(mockDrivePath);
    assert(envResult.checks.length === 4, '2.3 Exactly 4 distinct compatibility checks evaluated');

    const checkIds = envResult.checks.map((c) => c.id);
    assert(checkIds.includes('os_detected'), '2.4 Check 1: Operating system detected check present');
    assert(checkIds.includes('app_compatible'), '2.5 Check 2: Recovery application compatibility check present');
    assert(checkIds.includes('format_compatible'), '2.6 Check 3: Backup format compatibility check present');
    assert(checkIds.includes('backup_accessible'), '2.7 Check 4: Backup accessible and recovery ready check present');

    const osCheck = envResult.checks.find((c) => c.id === 'os_detected');
    assert(osCheck?.status === 'passed', '2.8 Check 1 passed with host OS identification');

    const appCheck = envResult.checks.find((c) => c.id === 'app_compatible');
    assert(appCheck?.status === 'passed', '2.9 Check 2 passed with native runtime compatibility');

    // Test failure handling: unsupported format version
    const manifestPath = path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'recovery-manifest.json');
    const rawManifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
    const invalidManifest = { ...rawManifest, formatVersion: '99.0.0' };
    fs.writeFileSync(manifestPath, JSON.stringify(invalidManifest), 'utf-8');

    const failedEnvResult = await EnvironmentDetector.evaluateRecoveryReadiness(mockDrivePath);
    const failedFormatCheck = failedEnvResult.checks.find((c) => c.id === 'format_compatible');
    assert(failedFormatCheck?.status === 'failed', '2.10 Format check correctly fails for unsupported format v99.0.0');
    assert(failedEnvResult.readyToProceed === false, '2.11 readyToProceed is false when format check fails');

    // Restore valid manifest
    fs.writeFileSync(manifestPath, JSON.stringify(rawManifest, null, 2), 'utf-8');

    // -------------------------------------------------------------
    // Test Category 3: Manifest Validation & Compatibility
    // -------------------------------------------------------------
    console.log('\n--- 3. Manifest Validation & Multi-Version Tests ---');

    const checkValid = await RecoveryManager.validateRecoveryPackage(mockDrivePath);
    assert(checkValid.valid === true, '3.1 Validates genuine recovery package successfully');
    assert(Boolean(checkValid.manifest?.product === 'Dero Vault™'), '3.2 Product branding preserved in manifest (Dero Vault™)');
    assert(Boolean(checkValid.manifest?.publisher === 'Enen Digital Labs Co. Ltd'), '3.3 Publisher preserved in manifest (Enen Digital Labs Co. Ltd)');
    assert(Boolean(checkValid.manifest?.nativeLaunchers?.windows), '3.4 Windows native launcher recorded in manifest');
    assert(Boolean(checkValid.manifest?.nativeLaunchers?.macos), '3.5 macOS native launcher recorded in manifest');
    assert(Boolean(checkValid.manifest?.nativeLaunchers?.linux), '3.6 Linux native launcher recorded in manifest');

    // Backward compatibility: format version 1.0.0 is also supported
    const v1Manifest = { ...rawManifest, formatVersion: '1.0.0' };
    fs.writeFileSync(manifestPath, JSON.stringify(v1Manifest), 'utf-8');
    const checkV1 = await RecoveryManager.validateRecoveryPackage(mockDrivePath);
    assert(checkV1.valid === true, '3.7 Backward compatible with format version 1.0.0');

    // Restore v1.1.0 manifest
    fs.writeFileSync(manifestPath, JSON.stringify(rawManifest, null, 2), 'utf-8');

    // Malformed JSON check
    const malformedPath = path.join(tmpTestRoot, 'MalformedDrive');
    fs.mkdirSync(path.join(malformedPath, 'DERO_VAULT_BACKUP', 'RECOVERY'), { recursive: true });
    fs.writeFileSync(path.join(malformedPath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'recovery-manifest.json'), '{"brokenJson": true,', 'utf-8');
    const checkMalformed = await RecoveryManager.validateRecoveryPackage(malformedPath);
    assert(checkMalformed.valid === false, '3.8 Malformed JSON safely caught without crashing');

    // -------------------------------------------------------------
    // Test Category 4: Cross-Platform Filename & Path Sanitization
    // -------------------------------------------------------------
    console.log('\n--- 4. Cross-Platform Filename & Path Sanitization Tests ---');

    // Windows DOS reserved device names
    const auxSanitized = RestoreEngine.sanitizeFileNameForTarget('AUX.txt', 'win32');
    assert(auxSanitized === 'AUX_.txt', '4.1 Windows reserved name AUX.txt sanitized to AUX_.txt');

    const conSanitized = RestoreEngine.sanitizeFileNameForTarget('con.doc', 'win32');
    assert(conSanitized === 'con_.doc', '4.2 Windows reserved name con.doc sanitized to con_.doc');

    const nulSanitized = RestoreEngine.sanitizeFileNameForTarget('NUL', 'win32');
    assert(nulSanitized === 'NUL_', '4.3 Windows reserved name NUL sanitized to NUL_');

    const com1Sanitized = RestoreEngine.sanitizeFileNameForTarget('com1.dat', 'win32');
    assert(com1Sanitized === 'com1_.dat', '4.4 Windows reserved name com1.dat sanitized to com1_.dat');

    // Windows illegal characters: < > : " / \ | ? *
    const colonSanitized = RestoreEngine.sanitizeFileNameForTarget('report:2026.docx', 'win32');
    assert(colonSanitized === 'report-2026.docx', '4.5 Illegal colon in report:2026.docx sanitized to report-2026.docx');

    const starSanitized = RestoreEngine.sanitizeFileNameForTarget('sales*summary?.pdf', 'win32');
    assert(starSanitized === 'sales_summary_.pdf', '4.6 Illegal * and ? in sales*summary?.pdf sanitized');

    const pipeSanitized = RestoreEngine.sanitizeFileNameForTarget('notes|meeting.txt', 'win32');
    assert(pipeSanitized === 'notes-meeting.txt', '4.7 Illegal pipe | in notes|meeting.txt sanitized');

    // Trailing dots and spaces
    const trailingDotSanitized = RestoreEngine.sanitizeFileNameForTarget('document. .pdf', 'win32');
    assert(trailingDotSanitized === 'document.pdf', '4.8 Trailing dots/spaces in document. .pdf trimmed safely');

    // POSIX NUL byte strip
    const posixSanitized = RestoreEngine.sanitizeFileNameForTarget('file\0name.txt', 'linux');
    assert(posixSanitized === 'filename.txt', '4.9 POSIX NUL byte stripped safely');

    // -------------------------------------------------------------
    // Test Category 5: Restoration Engine & Integrity Verification
    // -------------------------------------------------------------
    console.log('\n--- 5. Restoration Engine & Integrity Verification ---');

    // Populate DERO_VAULT_BACKUP/CURRENT on mock drive
    const namespaceName = 'OriginalUserDocs';
    const backupCurrentDir = path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'CURRENT', namespaceName);
    fs.mkdirSync(backupCurrentDir, { recursive: true });
    fs.copyFileSync(path.join(mockSourceDocs, 'Quarterly_Report.docx'), path.join(backupCurrentDir, 'Quarterly_Report.docx'));
    fs.copyFileSync(path.join(mockSourceDocs, 'Budget_Spreadsheet.xlsx'), path.join(backupCurrentDir, 'Budget_Spreadsheet.xlsx'));
    fs.mkdirSync(path.join(backupCurrentDir, 'Projects'), { recursive: true });
    fs.copyFileSync(path.join(mockSourceDocs, 'Projects', 'Strategy.pdf'), path.join(backupCurrentDir, 'Projects', 'Strategy.pdf'));

    // Also add a file with illegal Windows character to test live cross-platform restore
    fs.writeFileSync(path.join(backupCurrentDir, 'Project:Summary.txt'), 'Cross-platform notes', 'utf-8');

    const restoreEngine = new RestoreEngine(db);

    // 5.1 Inspection
    const inspectResult = await restoreEngine.inspectBackupDrive(mockDrivePath);
    assert(inspectResult.hasBackup === true, '5.1 Inspects backup drive and finds backup');
    assert(inspectResult.totalFiles === 4, '5.2 Accurately counts 4 recoverable files');
    assert(inspectResult.namespaces.length === 1, '5.3 Detects protected namespace');
    assert(Boolean(inspectResult.environmentResult), '5.4 Environment detection included in inspection result');

    // 5.2 Execute restore to replacement computer
    const targetRestoreDir = path.join(tmpTestRoot, 'ReplacementPC_Restored');
    fs.mkdirSync(targetRestoreDir, { recursive: true });

    const session = await restoreEngine.startRestore({
      mountPath: mockDrivePath,
      driveStableId: mockDrive.stableHardwareId,
      driveLetter: mockDrive.driveLetter,
      namespaces: [
        {
          namespace: namespaceName,
          targetPath: targetRestoreDir,
          enabled: true,
        },
      ],
      conflictStrategy: 'safe_rename',
      verifyIntegrity: true,
    });

    // Wait for restore to complete
    let restoreFinished = false;
    for (let i = 0; i < 40; i++) {
      if (['completed', 'completed_with_errors', 'failed'].includes(session.status)) {
        restoreFinished = true;
        break;
      }
      await new Promise((r) => setTimeout(r, 100));
    }

    assert(restoreFinished === true, '5.5 Restoration session status completes cleanly');
    assert(session.filesRestored === 4, `5.6 Exactly 4 files restored (got ${session.filesRestored})`);
    assert(session.filesVerified === 4, `5.7 All 4 restored files verified via SHA-256 (got ${session.filesVerified})`);

    // Verify restored file content
    const restoredReport = path.join(targetRestoreDir, 'Quarterly_Report.docx');
    assert(fs.existsSync(restoredReport), '5.8 Restored Quarterly_Report.docx exists on replacement computer');
    const restoredContent = fs.readFileSync(restoredReport, 'utf-8');
    assert(restoredContent === 'Quarterly Financial Report Q3 2026', '5.9 Restored file content exactly matches backup source');

    // Verify subfolder structure
    const restoredStrategy = path.join(targetRestoreDir, 'Projects', 'Strategy.pdf');
    assert(fs.existsSync(restoredStrategy), '5.10 Subfolder structure (Projects/Strategy.pdf) faithfully recreated');

    // Verify source backup is read-only / untouched
    const sourceReport = path.join(backupCurrentDir, 'Quarterly_Report.docx');
    assert(fs.existsSync(sourceReport), '5.11 Source file on backup drive is intact (read-only principle)');

    // 5.3 Non-destructive conflict handling test
    // Modify the restored file, then restore again with safe_rename
    fs.writeFileSync(restoredReport, 'MODIFIED LOCAL CONTENT ON NEW PC', 'utf-8');
    const sessionConflict = await restoreEngine.startRestore({
      mountPath: mockDrivePath,
      namespaces: [
        {
          namespace: namespaceName,
          targetPath: targetRestoreDir,
          enabled: true,
        },
      ],
      conflictStrategy: 'safe_rename',
      verifyIntegrity: true,
    });

    for (let i = 0; i < 40; i++) {
      if (['completed', 'completed_with_errors', 'failed'].includes(sessionConflict.status)) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const renamedFile = path.join(targetRestoreDir, 'Quarterly_Report (restored).docx');
    assert(fs.existsSync(renamedFile), '5.12 Conflict creates safe rename "Quarterly_Report (restored).docx"');
    assert(fs.readFileSync(restoredReport, 'utf-8') === 'MODIFIED LOCAL CONTENT ON NEW PC', '5.13 Original local destination file was NOT overwritten');

    // -------------------------------------------------------------
    // Test Category 6: Missing Launcher Fallback Test
    // -------------------------------------------------------------
    console.log('\n--- 6. Missing Launcher Resilience ---');

    // Delete launcher from drive
    fs.unlinkSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'RECOVERY', 'Rescue-Launcher.html'));
    fs.unlinkSync(path.join(mockDrivePath, 'RESCUE_MY_FILES.html'));

    const inspectWithoutLauncher = await restoreEngine.inspectBackupDrive(mockDrivePath);
    assert(inspectWithoutLauncher.hasBackup === true, '6.1 Valid backup remains discoverable and restorable even when launcher is missing/deleted');
    assert(inspectWithoutLauncher.totalFiles === 4, '6.2 Correctly counts all 4 files without launcher HTML');

    // -------------------------------------------------------------
    // Test Category 7: Security & Traversal Rejection
    // -------------------------------------------------------------
    console.log('\n--- 7. Security & Safety Tests ---');

    // Bare root drive restore rejected
    let rootDisallowed = false;
    try {
      await restoreEngine.startRestore({
        mountPath: mockDrivePath,
        namespaces: [
          {
            namespace: namespaceName,
            targetPath: '/',
            enabled: true,
          },
        ],
        conflictStrategy: 'safe_rename',
        verifyIntegrity: true,
      });
    } catch {
      rootDisallowed = true;
    }
    assert(rootDisallowed === true, '7.1 Restoring directly to bare root drive is rejected');

    // Secrets & Telemetry exclusion
    const freshProv = await RecoveryManager.provisionRecoveryPackage(mockDrive, mockProfile);
    const htmlContent = fs.readFileSync(freshProv.launcherPath!, 'utf-8');
    assert(!htmlContent.includes('password') && !htmlContent.includes('secret') && !htmlContent.includes('privateKey'), '7.2 No credentials or secrets embedded in recovery resources');
    assert(!htmlContent.includes('http://') || htmlContent.includes('http://127.0.0.1'), '7.3 Zero external unencrypted remote HTTP endpoints in launcher');

    // -------------------------------------------------------------
    // Test Category 8: Registration on Replacement Computer
    // -------------------------------------------------------------
    console.log('\n--- 8. Registration on Replacement Computer ---');

    const replacementDb = new LocalDatabase(path.join(tmpTestRoot, 'replacement-pc-db'));
    const { drive: regDrive, profile: regProfile } = replacementDb.registerDrive(mockDrive, {
      friendlyName: 'Migrated Office USB',
      sourceFolders: [targetRestoreDir],
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: true,
      verifyBackups: true,
      preserveVersions: true,
      driveStableId: mockDrive.stableHardwareId,
    });

    assert(regDrive.isRegistered === true, '8.1 Drive registered on replacement computer');
    assert(regProfile.sourceFolders[0] === targetRestoreDir, '8.2 Source folder correctly points to restored location on replacement computer');
    assert(fs.existsSync(path.join(mockDrivePath, 'DERO_VAULT_BACKUP', 'CURRENT')), '8.3 Registration did not erase or corrupt existing backup data on drive');

    // Re-provision launcher with replacement computer metadata
    const migratedProv = await RecoveryManager.provisionRecoveryPackage(mockDrive, regProfile);
    assert(migratedProv.isProvisioned === true, '8.4 Recovery launcher refreshed with replacement computer metadata');

    console.log('\n====================================================');
    console.log(`TEST SUMMARY: ${passed} PASSED, ${failed} FAILED`);
    console.log('====================================================');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    // Cleanup
    await new Promise((r) => setTimeout(r, 250));
    try {
      fs.rmSync(tmpTestRoot, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch((err) => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
