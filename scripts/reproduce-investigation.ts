import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { FileScanner } from '../server/services/fileScanner.js';
import { FileComparison } from '../server/services/fileComparison.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { BackupEngine } from '../server/services/backupEngine.js';
import { RemovableDrive, BackupProfile } from '../server/types.js';

// Setup disposable fixture paths in /tmp
const FIXTURE_ROOT = '/tmp/dero_investigation_fixture';
const DISPOSABLE_DEST = '/tmp/dero_investigation_dest';

function cleanup() {
  if (fs.existsSync(FIXTURE_ROOT)) fs.rmSync(FIXTURE_ROOT, { recursive: true, force: true });
  if (fs.existsSync(DISPOSABLE_DEST)) fs.rmSync(DISPOSABLE_DEST, { recursive: true, force: true });
}

async function createFixture() {
  cleanup();
  fs.mkdirSync(FIXTURE_ROOT, { recursive: true });
  fs.mkdirSync(DISPOSABLE_DEST, { recursive: true });

  // 1. Files at the root
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'root_file_1.txt'), 'root file 1 content');
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'root_file_2.docx'), 'root file 2 content');

  // 2. Immediate child folders (like OMAA_CLIENTS_WORK)
  const child1 = path.join(FIXTURE_ROOT, 'OMAA_CLIENTS_WORK');
  fs.mkdirSync(child1, { recursive: true });
  for (let i = 1; i <= 40; i++) {
    fs.writeFileSync(path.join(child1, `client_doc_${i}.pdf`), `content of client doc ${i} - ${'x'.repeat(100 * i)}`);
  }

  // 3. Deeply nested files
  const deepFolder = path.join(FIXTURE_ROOT, 'Projects', '2026', 'Q1', 'Budgets');
  fs.mkdirSync(deepFolder, { recursive: true });
  fs.writeFileSync(path.join(deepFolder, 'financials.xlsx'), 'financial excel data');
  fs.writeFileSync(path.join(deepFolder, 'notes.txt'), 'deep notes');

  // 4. Empty directories
  const emptyDir1 = path.join(FIXTURE_ROOT, 'EmptyArchive');
  const emptyDir2 = path.join(FIXTURE_ROOT, 'Projects', 'EmptySub');
  fs.mkdirSync(emptyDir1, { recursive: true });
  fs.mkdirSync(emptyDir2, { recursive: true });

  // 5. Duplicate filenames in different directories
  fs.writeFileSync(path.join(FIXTURE_ROOT, 'notes.txt'), 'root notes content');
  const child2 = path.join(FIXTURE_ROOT, 'SecondFolder');
  fs.mkdirSync(child2, { recursive: true });
  fs.writeFileSync(path.join(child2, 'notes.txt'), 'second folder notes content');
  fs.writeFileSync(path.join(child2, 'duplicate.dat'), 'duplicate in child2');
  const child3 = path.join(FIXTURE_ROOT, 'ThirdFolder');
  fs.mkdirSync(child3, { recursive: true });
  fs.writeFileSync(path.join(child3, 'duplicate.dat'), 'duplicate in child3');
}

async function runInvestigation() {
  console.log('--- Creating disposable test fixture ---');
  await createFixture();

  console.log('\n--- Test 1: FileScanner on FIXTURE_ROOT as a "folder" ---');
  const scanResult1 = await FileScanner.scanFolders([FIXTURE_ROOT]);
  const scannedAsFolder = scanResult1.files;
  console.log(`Scanned as folder: ${scannedAsFolder.length} files`);
  console.log('Sample relativePaths:', scannedAsFolder.slice(0, 5).map(f => f.relativePath));
  console.log('Sample sourceFolderName:', scannedAsFolder.slice(0, 3).map(f => f.sourceFolderName));

  console.log('\n--- Test 2: FileScanner on an individual subfolder (OMAA_CLIENTS_WORK) ---');
  const child1 = path.join(FIXTURE_ROOT, 'OMAA_CLIENTS_WORK');
  const scanResult2 = await FileScanner.scanFolders([child1]);
  const scannedSubfolder = scanResult2.files;
  console.log(`Scanned subfolder directly: ${scannedSubfolder.length} files`);

  // Count files in OMAA_CLIENTS_WORK from the full scan
  const omaaInFullScan = scannedAsFolder.filter(f => f.fullPath.includes('OMAA_CLIENTS_WORK'));
  console.log(`OMAA_CLIENTS_WORK files found in full scan: ${omaaInFullScan.length}`);

  cleanup();
}

runInvestigation().catch(console.error);
