/**
 * Dero Vault — Automated Verification Suite for Automatic Startup & Background Patrol
 * Tests Phase 2, Phase 3, Phase 4, and Phase 5 reliability guarantees.
 */

import fs from 'fs';
import path from 'path';
import os from 'os';
import { LocalDatabase } from '../server/services/localDb';

async function runTests() {
  console.log('====================================================');
  console.log('Dero Vault — Automatic Startup & Patrol Test Suite');
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

  const tmpTestDir = path.join(os.tmpdir(), `dero-vault-test-${Date.now()}`);
  fs.mkdirSync(tmpTestDir, { recursive: true });

  try {
    // -------------------------------------------------------------
    // Test 1: Fresh Installation Defaults
    // -------------------------------------------------------------
    console.log('--- Test 1: Fresh Installation Defaults ---');
    const freshDb = new LocalDatabase(path.join(tmpTestDir, 'fresh-install'));
    const freshSettings = freshDb.getSettings();
    assert(
      freshSettings.startAtLogin === true,
      '1.1 Fresh install defaults startAtLogin to true ("Make safe action lazy action")'
    );
    assert(
      freshSettings.startMinimized === true,
      '1.2 Fresh install defaults startMinimized to true (runs quietly in tray)'
    );

    const freshStartupStatus = freshDb.getStartupPreference();
    assert(
      freshStartupStatus === true,
      '1.3 getStartupPreference() returns true on new install'
    );

    // -------------------------------------------------------------
    // Test 2: Migration of Legacy Database
    // -------------------------------------------------------------
    console.log('\n--- Test 2: Legacy Database Migration ---');
    const legacyDir = path.join(tmpTestDir, 'legacy-install');
    fs.mkdirSync(path.join(legacyDir, 'data'), { recursive: true });
    // Write legacy db missing startAtLogin and startMinimized
    const legacyRaw = {
      version: '1.0.0',
      registeredDrives: {},
      backupProfiles: {},
      history: [],
      settings: {
        autoBackup: true,
        startOnConnect: true,
        turboBackup: true,
        notifyOnStart: true,
        notifyOnComplete: true,
        verifyBackups: true,
        preserveVersions: true,
        testMode: false,
        logLevel: 'info',
      },
    };
    fs.writeFileSync(
      path.join(legacyDir, 'data', 'dero-vault-data.json'),
      JSON.stringify(legacyRaw, null, 2),
      'utf8'
    );

    const migratedDb = new LocalDatabase(legacyDir);
    const migratedSettings = migratedDb.getSettings();
    assert(
      migratedSettings.startAtLogin === true,
      '2.1 Legacy database automatically migrates startAtLogin to true'
    );
    assert(
      migratedSettings.startMinimized === true,
      '2.2 Legacy database automatically migrates startMinimized to true'
    );

    // -------------------------------------------------------------
    // Test 3: Respecting User Explicit Disabling (Never Silently Re-enable)
    // -------------------------------------------------------------
    console.log('\n--- Test 3: Explicit User Toggle Persistence ---');
    migratedDb.setStartupPreference(false);
    assert(
      migratedDb.getSettings().startAtLogin === false,
      '3.1 setStartupPreference(false) disables autostart in settings'
    );
    assert(
      migratedDb.getStartupPreference() === false,
      '3.2 getStartupPreference() reflects false'
    );

    // Reload database from disk to verify persistence across reboots
    const reloadedDb = new LocalDatabase(legacyDir);
    assert(
      reloadedDb.getSettings().startAtLogin === false,
      '3.3 Explicitly disabled startup survives app restart / computer reboot'
    );
    assert(
      reloadedDb.getStartupPreference() === false,
      '3.4 User preference is NOT silently re-enabled'
    );

    // Re-enable startup
    reloadedDb.setStartupPreference(true);
    assert(
      reloadedDb.getSettings().startAtLogin === true,
      '3.5 Re-enabling startup updates preference cleanly'
    );

    // -------------------------------------------------------------
    // Test 4: Deduplication and Drive Identity
    // -------------------------------------------------------------
    console.log('\n--- Test 4: Drive Identity & Deduplication ---');
    const driveA = {
      id: 'drive-1',
      stableHardwareId: 'VEN_SANDISK_PROD_USB_SERIAL_12345',
      volumeSerial: '8A34-BF12',
      volumeLabel: 'VAULT_DRIVE',
      driveLetter: 'E:',
      mountPath: path.join(tmpTestDir, 'mock-drive-e'),
      totalBytes: 64000000000,
      freeBytes: 32000000000,
      fileSystem: 'NTFS',
      deviceModel: 'SanDisk Ultra USB 3.0',
      isRemovable: true,
      isRegistered: true,
      isConnected: true,
      isSystemDrive: false,
    };
    reloadedDb.registerDrive(driveA, {
      driveStableId: driveA.stableHardwareId,
      friendlyName: 'Vault Drive',
      sourceFolders: ['C:\\Users\\Mock\\Documents'],
      destinationFolder: 'DERO_VAULT_BACKUP',
      autoBackupEnabled: true,
      verifyBackups: true,
      preserveVersions: true,
    });
    const registeredList = reloadedDb.getRegisteredDrives();
    assert(
      registeredList.length === 1 && registeredList[0].stableHardwareId === 'VEN_SANDISK_PROD_USB_SERIAL_12345',
      '4.1 Registered drive saved with hardware identifier'
    );

    // If drive letter changes to F: but serial/hardware ID matches
    reloadedDb.updateRegisteredDrive('VEN_SANDISK_PROD_USB_SERIAL_12345', {
      driveLetter: 'F:',
      mountPath: path.join(tmpTestDir, 'mock-drive-f'),
    });
    const updatedList = reloadedDb.getRegisteredDrives();
    assert(
      updatedList.length === 1 && updatedList[0].driveLetter === 'F:',
      '4.2 Drive re-reconciliation correctly updates existing record without duplicates'
    );

    // -------------------------------------------------------------
    // Test 5: Auto-Backup Suppression when Disabled
    // -------------------------------------------------------------
    console.log('\n--- Test 5: Auto-Backup Preferences ---');
    reloadedDb.updateSettings({ autoBackup: false });
    assert(
      reloadedDb.getSettings().autoBackup === false,
      '5.1 Auto backup master switch can be disabled'
    );
    reloadedDb.updateSettings({ autoBackup: true });
    assert(
      reloadedDb.getSettings().autoBackup === true,
      '5.2 Auto backup master switch can be re-enabled'
    );

    // -------------------------------------------------------------
    // Test 6: Verify Logging of Startup Events
    // -------------------------------------------------------------
    console.log('\n--- Test 6: Diagnostic Audit Logging ---');
    const logs = reloadedDb.getLogs(50);
    const hasStartupLog = logs.some((l) => l.module === 'Startup');
    assert(
      hasStartupLog,
      '6.1 Startup preference changes create local diagnostic audit logs'
    );

    console.log('\n====================================================');
    console.log(`Results: ${passed} passed, ${failed} failed`);
    console.log('====================================================\n');

    if (failed > 0) {
      process.exit(1);
    }
  } finally {
    try {
      await new Promise((r) => setTimeout(r, 200));
      fs.rmSync(tmpTestDir, { recursive: true, force: true });
    } catch {}
  }
}

runTests().catch((err) => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
