import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { LocalDatabase } from '../server/services/localDb.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { RemovableDrive, BackupProfile } from '../server/types.js';

const FIXTURE_ROOT = '/tmp/dero_investigation_drive_d';
const BACKUP_DRIVE = '/tmp/dero_investigation_drive_e';

function cleanup() {
  if (fs.existsSync(FIXTURE_ROOT)) fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  if (fs.existsSync(BACKUP_DRIVE)) fs.rmSync(BACKUP_DRIVE, { recursive: true, force: true });
}

async function createFixture() {
  cleanup();
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  fs.mkdirSync(BACKUP_DRIVE, { recursive: true });

  // Root files
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'root_summary.txt'), 'root summary text');
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'notes.txt'), 'notes at root');

  // Immediate child folder OMAA_CLIENTS_WORK with 40 files
  const omaa = path.join(FIXTURE_ROOT, 'OMAA_CLIENTS_WORK');
  fs.mkdirSync(omaa, { recursive: true });
  for (let i = 1; i <= 40; i++) {
    fs.writeFileSync(path.join(omaa, `client_${i}.pdf`), `client content ${i} - ${'y'.repeat(500 * i)}`);
  }

  // Deeply nested files
  const deep = path.join(FIXTURE_ROOT, 'Projects', '2026', 'Contracts');
  fs.mkdirSync(deep, { recursive: true });
  fs.writeFileSync(path.join(deep, 'agreement.docx'), 'signed agreement 2026');
  fs.writeFileSync(path.join(deep, 'notes.txt'), 'nested duplicate notes');

  // Empty directories
  fs.mkdirSync(path.join(FIXTURE_ROOT, 'EmptyFolder1'), { recursive: true });
  fs.mkdirSync(path.join(FIXTURE_ROOT, 'Projects', 'EmptySubfolder'), { recursive: true });

  // Duplicate filenames in different directories
  const sec = path.join(FIXTURE_ROOT, 'SecondDir');
  fs.mkdirSync(sec, { recursive: true });
  fs.writeFileSync(path.join(sec, 'notes.txt'), 'second dir notes');
  fs.writeFileSync(path.join(sec, 'dup.bin'), 'dup in sec');

  const third = path.join(FIXTURE_ROOT, 'ThirdDir');
  fs.mkdirSync(third, { recursive: true });
  fs.writeFileSync(path.join(third, 'dup.bin'), 'dup in third');
}

function createMockDrive(): RemovableDrive {
  return {
    id: 'drv_test_e',
    stableHardwareId: 'TEST-HARDWARE-E',
    volumeSerial: 'SER-1234',
    volumeLabel: 'BACKUP_E',
    driveLetter: 'E:',
    mountPath: BACKUP_DRIVE,
    totalBytes: 50 * 1024 * 1024 * 1024,
    freeBytes: 40 * 1024 * 1024 * 1024,
    fileSystem: 'NTFS',
    deviceModel: 'Test Backup Drive',
    busType: 'USB',
    platform: 'linux',
    isRemovable: true,
    isRegistered: true,
    isConnected: true,
    isSystemDrive: false,
    lastConnectedAt: new Date().toISOString(),
  };
}

async function testMode(name: string, sourceFolders: string[]) {
  console.log(`\n======================================================`);
  console.log(`RUNNING MODE: ${name}`);
  console.log(`Source Folders:`, sourceFolders);
  console.log(`======================================================`);

  const dbPath = path.join(BACKUP_DRIVE, 'dero_test.db');
  const db = new LocalDatabase(dbPath);
  const engine = new BackupEngine(db);

  const drive = createMockDrive();
  const profile: BackupProfile = {
    id: `prof_${name}`,
    driveStableId: drive.stableHardwareId,
    friendlyName: `Profile ${name}`,
    sourceFolders: sourceFolders,
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: true,
    verifyBackups: true,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const session = await engine.startBackup(drive, profile, { turboBackup: false });

  // Wait for session to finish
  await new Promise<void>((resolve) => {
    engine.on('session:complete', () => resolve());
  });

  const finalSession = engine.getCurrentSession()!;
  console.log(`\nSession Results for ${name}:`);
  console.log(`Status: ${finalSession.status}`);
  console.log(`Files Scanned: ${finalSession.filesScanned}`);
  console.log(`Files Copied:  ${finalSession.filesCopied}`);
  console.log(`Files Skipped: ${finalSession.filesSkipped}`);
  console.log(`Files Failed:  ${finalSession.filesFailed}`);
  console.log(`Errors: ${finalSession.errors.length}`);
  if (finalSession.errors.length > 0) {
    console.log('Errors sample:', finalSession.errors.slice(0, 5));
  }

  // Inspect destination filesystem
  const currentDir = path.join(BACKUP_DRIVE, 'DERO_VAULT_BACKUP', 'CURRENT');
  const writtenFiles: string[] = [];
  function walk(dir: string) {
    if (!fs.existsSync(dir)) return;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else writtenFiles.push(path.relative(currentDir, p));
    }
  }
  walk(currentDir);
  console.log(`\nTotal files written in CURRENT: ${writtenFiles.length}`);
  console.log(`Sample written relative paths:`, writtenFiles.slice(0, 8));

  const omaaWritten = writtenFiles.filter(p => p.includes('OMAA_CLIENTS_WORK'));
  console.log(`OMAA_CLIENTS_WORK files in CURRENT: ${omaaWritten.length}`);

  return { finalSession, writtenFiles };
}

async function main() {
  // Test A: Folder mode (single folder OMAA_CLIENTS_WORK)
  await createFixture();
  const omaaFolder = path.join(FIXTURE_ROOT, 'OMAA_CLIENTS_WORK');
  await testMode('INDIVIDUAL_FOLDER_MODE', [omaaFolder]);

  // Clean backup drive
  fs.rmSync(BACKUP_DRIVE, { recursive: true, force: true });
  fs.mkdirSync(BACKUP_DRIVE, { recursive: true });

  // Test B: Root mode (entire fixture root)
  await testMode('DRIVE_ROOT_MODE', [FIXTURE_ROOT]);

  cleanup();
}

main().catch(console.error);
