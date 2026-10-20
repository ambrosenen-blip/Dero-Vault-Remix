/**
 * Dero Vault — Turbo Backup Benchmark Suite
 * Measures baseline vs optimized backup engine performance on identical synthetic datasets.
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { BackupEngine } from '../server/services/backupEngine.js';
import { LocalDatabase } from '../server/services/localDb.js';
import { RemovableDrive, BackupProfile } from '../src/types.js';

interface WorkloadDef {
  name: string;
  description: string;
  generate: (dir: string) => Promise<{ fileCount: number; totalBytes: number }>;
}

const BENCH_ROOT = path.join(process.cwd(), '.dero_bench');

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return (bytes / Math.pow(k, i)).toFixed(2) + ' ' + sizes[i];
}

async function cleanDir(dir: string): Promise<void> {
  if (fs.existsSync(dir)) {
    await fs.promises.rm(dir, { recursive: true, force: true });
  }
  await fs.promises.mkdir(dir, { recursive: true });
}

export async function createWorkloads(): Promise<{
  sourceRoot: string;
  destRoot: string;
  workloads: Record<string, string>;
  stats: Record<string, { fileCount: number; totalBytes: number }>;
}> {
  const sourceRoot = path.join(BENCH_ROOT, 'source');
  const destRoot = path.join(BENCH_ROOT, 'destination');

  if (!fs.existsSync(BENCH_ROOT)) {
    await fs.promises.mkdir(BENCH_ROOT, { recursive: true });
  }
  await cleanDir(sourceRoot);
  await cleanDir(destRoot);

  const stats: Record<string, { fileCount: number; totalBytes: number }> = {};
  const workloads: Record<string, string> = {};

  // 1. Many small files (500 files, 1KB - 20KB each)
  const smallDir = path.join(sourceRoot, 'many_small');
  await fs.promises.mkdir(smallDir, { recursive: true });
  let smallBytes = 0;
  for (let i = 0; i < 500; i++) {
    const sub = path.join(smallDir, `folder_${Math.floor(i / 50)}`);
    if (!fs.existsSync(sub)) await fs.promises.mkdir(sub, { recursive: true });
    const size = 1024 + (i * 37) % (20 * 1024);
    const buf = crypto.randomBytes(size);
    await fs.promises.writeFile(path.join(sub, `small_${i}.dat`), buf);
    smallBytes += size;
  }
  workloads['many_small'] = smallDir;
  stats['many_small'] = { fileCount: 500, totalBytes: smallBytes };

  // 2. Large files (3 files: 15MB, 25MB, 40MB = 80MB)
  const largeDir = path.join(sourceRoot, 'large_files');
  await fs.promises.mkdir(largeDir, { recursive: true });
  const sizes = [15 * 1024 * 1024, 25 * 1024 * 1024, 40 * 1024 * 1024];
  let largeBytes = 0;
  for (let i = 0; i < sizes.length; i++) {
    const filePath = path.join(largeDir, `large_archive_${i + 1}.iso`);
    const stream = fs.createWriteStream(filePath);
    const chunkSize = 1024 * 1024;
    const chunks = sizes[i] / chunkSize;
    const chunkBuf = crypto.randomBytes(chunkSize);
    for (let c = 0; c < chunks; c++) {
      stream.write(chunkBuf);
    }
    await new Promise<void>((resolve) => stream.end(() => resolve()));
    largeBytes += sizes[i];
  }
  workloads['large_files'] = largeDir;
  stats['large_files'] = { fileCount: 3, totalBytes: largeBytes };

  // 3. Mixed office document set (60 files: docs, spreadsheets, pdfs, images, 10KB - 3MB = ~25MB)
  const mixedDir = path.join(sourceRoot, 'mixed_office');
  await fs.promises.mkdir(mixedDir, { recursive: true });
  let mixedBytes = 0;
  const exts = ['.docx', '.xlsx', '.pdf', '.pptx', '.png', '.jpg'];
  for (let i = 0; i < 60; i++) {
    const sub = path.join(mixedDir, ['Finance', 'Legal', 'Projects', 'Marketing'][i % 4]);
    if (!fs.existsSync(sub)) await fs.promises.mkdir(sub, { recursive: true });
    const ext = exts[i % exts.length];
    const size = 10 * 1024 + (i * 137 * 1024) % (3 * 1024 * 1024);
    const buf = crypto.randomBytes(size);
    await fs.promises.writeFile(path.join(sub, `document_${i}${ext}`), buf);
    mixedBytes += size;
  }
  workloads['mixed_office'] = mixedDir;
  stats['mixed_office'] = { fileCount: 60, totalBytes: mixedBytes };

  return { sourceRoot, destRoot, workloads, stats };
}

export async function runWorkload(
  name: string,
  sourceFolder: string,
  destRoot: string,
  verifyBackups = true,
  isTurbo = false
): Promise<{
  workload: string;
  filesScanned: number;
  filesCopied: number;
  filesSkipped: number;
  bytesTransferred: number;
  elapsedMs: number;
  throughputMBs: number;
  peakMemoryMB: number;
  isVerified: boolean;
}> {
  const db = new LocalDatabase(path.join(destRoot, '.bench_vault.json'));
  const engine = new BackupEngine(db);

  const fakeDrive: RemovableDrive = {
    id: 'bench_drive_1',
    stableHardwareId: 'BENCH_DRIVE_STABLE_001',
    driveLetter: 'B:',
    volumeLabel: 'BENCH_DRIVE',
    volumeSerial: 'BENCH_SERIAL_001',
    deviceModel: 'Bench Disk USB 3.0',
    mountPath: destRoot,
    totalBytes: 100 * 1024 * 1024 * 1024,
    freeBytes: 90 * 1024 * 1024 * 1024,
    fileSystem: 'NTFS',
    busType: 'USB',
    isRemovable: true,
    isConnected: true,
    isRegistered: true,
    isSystemDrive: false,
  };

  const profile: BackupProfile = {
    id: 'bench_profile_1',
    driveStableId: fakeDrive.stableHardwareId,
    friendlyName: 'Benchmark Granary',
    sourceFolders: [sourceFolder],
    destinationFolder: 'DERO_VAULT_BACKUP',
    autoBackupEnabled: false,
    verifyBackups,
    preserveVersions: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const startMem = process.memoryUsage().heapUsed;
  let peakMem = startMem;
  const memInterval = setInterval(() => {
    const current = process.memoryUsage().heapUsed;
    if (current > peakMem) peakMem = current;
  }, 10);

  const startTime = performance.now();
  const session = await engine.startBackup(fakeDrive, profile, { turboBackup: isTurbo });

  await new Promise<void>((resolve, reject) => {
    engine.on('session:complete', (s) => {
      if (s.id === session.id) resolve();
    });
    engine.on('session:update', (s) => {
      if (s.id === session.id && (s.status === 'failed' || s.status === 'interrupted')) {
        reject(new Error(`Backup ended in status: ${s.status}`));
      }
    });
  });

  const elapsedMs = performance.now() - startTime;
  clearInterval(memInterval);

  const finalSession = db.getBackupSession(session.id) || session;
  const throughputMBs =
    finalSession.bytesTransferred > 0 && elapsedMs > 0
      ? (finalSession.bytesTransferred / (1024 * 1024)) / (elapsedMs / 1000)
      : 0;

  return {
    workload: name,
    filesScanned: finalSession.filesScanned,
    filesCopied: finalSession.filesCopied,
    filesSkipped: finalSession.filesSkipped,
    bytesTransferred: finalSession.bytesTransferred,
    elapsedMs,
    throughputMBs,
    peakMemoryMB: peakMem / (1024 * 1024),
    isVerified: finalSession.isVerified,
  };
}

async function main() {
  console.log('========================================================================');
  console.log('DERO VAULT — RUNNING BASELINE BENCHMARKS');
  console.log('Hardware & Platform: Linux node environment (Synthetic Benchmark)');
  console.log('========================================================================\n');

  const { sourceRoot, destRoot, workloads, stats } = await createWorkloads();

  const results: any[] = [];

  for (const [name, folder] of Object.entries(workloads)) {
    console.log(`\n--- Running Workload: ${name} ---`);
    console.log(`Source items: ${stats[name].fileCount} files, ${formatBytes(stats[name].totalBytes)}`);

    // Fresh destination for clean baseline
    const dest = path.join(destRoot, name);
    await cleanDir(dest);

    const res = await runWorkload(name, folder, dest, true);
    console.log(`Result: ${res.filesCopied} files copied in ${res.elapsedMs.toFixed(1)} ms (${res.throughputMBs.toFixed(2)} MB/s). Verified: ${res.isVerified}`);
    results.push(res);
  }

  // Incremental Workload: Re-run mixed_office on existing destination (0 changed files)
  console.log(`\n--- Running Workload: incremental_unchanged ---`);
  const mixedDest = path.join(destRoot, 'mixed_office');
  const incRes = await runWorkload('incremental_unchanged', workloads['mixed_office'], mixedDest, true);
  console.log(`Result: ${incRes.filesCopied} copied, ${incRes.filesSkipped} skipped in ${incRes.elapsedMs.toFixed(1)} ms. Verified: ${incRes.isVerified}`);
  results.push(incRes);

  console.log('\n========================================================================');
  console.log('BASELINE RESULTS SUMMARY (JSON):');
  console.log(JSON.stringify(results, null, 2));

  // Save to file for comparison
  fs.writeFileSync(path.join(BENCH_ROOT, 'baseline_results.json'), JSON.stringify(results, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error('Benchmark error:', err);
    process.exit(1);
  });
}
