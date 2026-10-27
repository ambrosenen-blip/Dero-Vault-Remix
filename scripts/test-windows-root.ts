import path from 'path';
import { FileComparison } from '../server/services/fileComparison.js';
import { FileScanner, ScannedFile } from '../server/services/fileScanner.js';

console.log('=== TESTING WINDOWS DRIVE ROOT PATH LOGIC ===');

const testCases = [
  'D:\\',
  'D:/',
  'D:',
  'D:\\OMAA_CLIENTS_WORK',
  'C:\\Users\\User\\Documents'
];

for (const tc of testCases) {
  const winBasename = path.win32.basename(tc);
  const scannerFolderName = winBasename || 'Root';
  const namespace = FileComparison.getSourceNamespace(tc, scannerFolderName);
  
  console.log(`\nPath: "${tc}"`);
  console.log(`  win32.basename:     "${winBasename}"`);
  console.log(`  scannerFolderName:  "${scannerFolderName}"`);
  console.log(`  namespace:          "${namespace}"`);

  // Relative path calculation test
  const sampleFile = 'D:\\OMAA_CLIENTS_WORK\\client_1.pdf';
  if (tc.startsWith('D:')) {
    const rel = path.win32.relative(tc, sampleFile);
    const dest = path.win32.join('E:\\DERO_VAULT_BACKUP\\CURRENT', namespace, rel);
    console.log(`  relative to "${sampleFile}": "${rel}"`);
    console.log(`  final destination: "${dest}"`);
  }
}
