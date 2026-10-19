/**
 * Dero Vault — Turbo Backup Comparison Benchmark Suite
 * Compares Turbo performance directly against verified Baseline on identical datasets.
 */

import fs from 'fs';
import path from 'path';
import { createWorkloads, runWorkload } from './benchmark-baseline.js';

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

async function main() {
  const baselinePath = path.join(BENCH_ROOT, 'baseline_results.json');
  if (!fs.existsSync(baselinePath)) {
    console.error('Error: baseline_results.json does not exist. Please run benchmark-baseline.ts first.');
    process.exit(1);
  }

  const baselineResults = JSON.parse(fs.readFileSync(baselinePath, 'utf-8'));
  const baselineMap = new Map<string, any>(baselineResults.map((r: any) => [r.workload, r]));

  console.log('========================================================================');
  console.log('DERO VAULT — TURBO ENGINE VERIFICATION BENCHMARK');
  console.log('Target: >= 70% elapsed-time reduction (90% stretch)');
  console.log('========================================================================\n');

  const { workloads } = await createWorkloads();
  const turboDestRoot = path.join(BENCH_ROOT, 'destination_turbo');
  await cleanDir(turboDestRoot);

  const turboResults: any[] = [];
  const comparisons: any[] = [];

  for (const [name, folder] of Object.entries(workloads)) {
    console.log(`\n--- Running Turbo Workload: ${name} ---`);
    const dest = path.join(turboDestRoot, name);
    await cleanDir(dest);

    const res = await runWorkload(name, folder, dest, true);
    turboResults.push(res);

    const baseline = baselineMap.get(name);
    if (baseline) {
      const elapsedReductionPercent = ((baseline.elapsedMs - res.elapsedMs) / baseline.elapsedMs) * 100;
      const speedupFactor = baseline.elapsedMs / res.elapsedMs;

      comparisons.push({
        workload: name,
        fileCount: res.filesCopied,
        bytes: res.bytesTransferred,
        baselineMs: baseline.elapsedMs,
        turboMs: res.elapsedMs,
        elapsedReductionPercent,
        speedupFactor,
        baselineMBs: baseline.throughputMBs,
        turboMBs: res.throughputMBs,
        verified: res.isVerified,
      });

      console.log(`Baseline Elapsed: ${baseline.elapsedMs.toFixed(1)} ms (${baseline.throughputMBs.toFixed(2)} MB/s)`);
      console.log(`Turbo Elapsed:    ${res.elapsedMs.toFixed(1)} ms (${res.throughputMBs.toFixed(2)} MB/s)`);
      console.log(`Elapsed Reduction: ${elapsedReductionPercent.toFixed(2)}% | Speedup: ${speedupFactor.toFixed(2)}x`);
      console.log(`Integrity Check:  ${res.isVerified ? 'VERIFIED (PASS ✓)' : 'FAILED'}`);
    }
  }

  // Incremental Workload on Turbo
  console.log(`\n--- Running Turbo Workload: incremental_unchanged ---`);
  const mixedTurboDest = path.join(turboDestRoot, 'mixed_office');
  const incRes = await runWorkload('incremental_unchanged', workloads.mixed_office, mixedTurboDest, true);
  turboResults.push(incRes);

  const baselineInc = baselineMap.get('incremental_unchanged');
  if (baselineInc) {
    const elapsedReductionPercent = ((baselineInc.elapsedMs - incRes.elapsedMs) / baselineInc.elapsedMs) * 100;
    const speedupFactor = baselineInc.elapsedMs / incRes.elapsedMs;

    comparisons.push({
      workload: 'incremental_unchanged',
      fileCount: incRes.filesSkipped,
      bytes: 0,
      baselineMs: baselineInc.elapsedMs,
      turboMs: incRes.elapsedMs,
      elapsedReductionPercent,
      speedupFactor,
      baselineMBs: 0,
      turboMBs: 0,
      verified: true,
    });

    console.log(`Baseline Elapsed: ${baselineInc.elapsedMs.toFixed(1)} ms`);
    console.log(`Turbo Elapsed:    ${incRes.elapsedMs.toFixed(1)} ms`);
    console.log(`Elapsed Reduction: ${elapsedReductionPercent.toFixed(2)}% | Speedup: ${speedupFactor.toFixed(2)}x`);
  }

  console.log('\n========================================================================');
  console.log('FINAL BENCHMARK COMPARISON TABLE:');
  console.log('========================================================================');
  console.table(
    comparisons.map((c) => ({
      Workload: c.workload,
      Files: c.fileCount,
      'Data Size': formatBytes(c.bytes),
      'Baseline (ms)': c.baselineMs.toFixed(1),
      'Turbo (ms)': c.turboMs.toFixed(1),
      'Reduction %': `${c.elapsedReductionPercent.toFixed(2)}%`,
      Speedup: `${c.speedupFactor.toFixed(2)}x`,
      'Baseline MB/s': c.baselineMBs.toFixed(2),
      'Turbo MB/s': c.turboMBs.toFixed(2),
      Verified: c.verified ? 'YES' : 'NO',
    }))
  );

  fs.writeFileSync(path.join(BENCH_ROOT, 'comparison_results.json'), JSON.stringify(comparisons, null, 2));
}

main().catch((err) => {
  console.error('Error running Turbo benchmark:', err);
  process.exit(1);
});
