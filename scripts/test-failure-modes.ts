import fs from 'fs';
import path from 'path';
import { FileScanner } from '../server/services/fileScanner.js';
import { FileComparison } from '../server/services/fileComparison.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { RemovableDrive, BackupProfile } from '../server/types.js';

const FAIL_DIR = '/tmp/dero_fail_mode_test';

async function testFailureModes() {
  if (fs.existsSync(FAIL_DIR)) fs.rmSync(FAIL_DIR, { recursive: true, force: true });
  fs.mkdirSync(FAIL_DIR, { recursive: true });

  const srcDir = path.join(FAIL_DIR, 'source');
  const destDir = path.join(FAIL_DIR, 'dest');
  fs.mkdirSync(srcDir, { recursive: true });
  fs.mkdirSync(destDir, { recursive: true });

  // 1. Regular file
  fs.writeFileSync(path.join(srcDir, 'regular_file.txt'), 'regular content');

  // 2. Directory symlink: Subdir pointing to another directory
  const targetSubdir = path.join(FAIL_DIR, 'symlink_target');
  fs.mkdirSync(targetSubdir, { recursive: true });
  for (let i = 1; i <= 10; i++) {
    fs.writeFileSync(path.join(targetSubdir, `symlinked_file_${i}.txt`), `symlink content ${i}`);
  }
  const symlinkFolder = path.join(srcDir, 'SymlinkedFolder');
  try {
    fs.symlinkSync(targetSubdir, symlinkFolder, 'dir');
  } catch (e: any) {
    console.log('Symlink creation not supported in this env:', e.message);
  }

  // 3. Inaccessible folder (permission 000)
  const lockedFolder = path.join(srcDir, 'LockedFolder');
  fs.mkdirSync(lockedFolder, { recursive: true });
  fs.writeFileSync(path.join(lockedFolder, 'secret.docx'), 'secret doc');
  try {
    fs.chmodSync(lockedFolder, 0o000);
  } catch {}

  // 4. FileScanner scan
  console.log('\n--- SCANNING FAILURE FIXTURE ---');
  const scanResult = await FileScanner.scanFolders([srcDir]);
  const scanned = scanResult.files;
  console.log(`Scanned count: ${scanned.length}`);
  for (const s of scanned) {
    console.log(`  Scanned: ${s.relativePath} (size: ${s.size})`);
  }
  console.log(`Scan errors captured: ${scanResult.errors.length}`);
  for (const err of scanResult.errors) {
    console.log(`  Error at: ${err.path} -> ${err.error}`);
  }

  // Restore permissions for cleanup
  try {
    fs.chmodSync(lockedFolder, 0o755);
  } catch {}
  fs.rmSync(FAIL_DIR, { recursive: true, force: true });
}

testFailureModes().catch(console.error);
