/**
 * Dero Vault — Windows Platform Adapter (Reference Implementation)
 * Preserves the exact, verified Windows storage detection logic:
 * - USB mass storage & USB external enclosure detection via WMI/CIM
 * - Hardware serial + Volume serial stable identity formulation
 * - Exclusion of C: and SystemDrive
 * - Windows native folder picker via System.Windows.Forms
 */

import os from 'os';
import path from 'path';
import fs from 'fs';
import { spawn } from 'child_process';
import { IPlatformAdapter, PlatformDriveInfo, PlatformFolderOption, SupportedPlatform } from './types.js';

/**
 * Safely executes PowerShell using spawn with:
 * - Hard timeout of 8 seconds (SIGKILL forcibly terminates child process)
 * - stdio: ['ignore', 'pipe', 'pipe'] (stdin immediately closed / ignored)
 * - shell: false (prevents cmd.exe stdio leaks)
 * - Resolves on 'close' event (ensures streams are fully drained)
 * - Permanent low-noise [ChildProcess] logging
 */
function runPowerShellSafe(
  encodedCommand: string,
  timeoutMs: number = 8000
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    console.log(
      `[ChildProcess] [${new Date().toISOString()}] Spawned: powershell.exe -EncodedCommand (timeout: ${timeoutMs}ms)`
    );

    const child = spawn(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-ExecutionPolicy',
        'Bypass',
        '-EncodedCommand',
        encodedCommand,
      ],
      {
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
      }
    );

    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;

    const timer = setTimeout(() => {
      timedOut = true;
      console.warn(
        `[ChildProcess] [${new Date().toISOString()}] TIMED OUT after ${timeoutMs}ms. Forcibly killing process PID ${child.pid} via taskkill/SIGKILL.`
      );
      try {
        if (process.platform === 'win32' && child.pid) {
          spawn('taskkill', ['/F', '/T', '/PID', child.pid.toString()], {
            stdio: 'ignore',
            windowsHide: true,
          });
        }
        child.kill('SIGKILL');
      } catch (kErr: any) {
        console.error(
          `[ChildProcess] [${new Date().toISOString()}] Error killing process: ${kErr.message}`
        );
      }
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    child.on('error', (err) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      console.error(
        `[ChildProcess] [${new Date().toISOString()}] Spawn error after ${Date.now() - startTime}ms: ${err.message}`
      );
      reject(err);
    });

    child.on('close', (code, signal) => {
      clearTimeout(timer);
      if (settled) return;
      settled = true;
      const elapsed = Date.now() - startTime;
      console.log(
        `[ChildProcess] [${new Date().toISOString()}] Exited with code ${code}, signal=${signal} after ${elapsed}ms`
      );
      if (timedOut) {
        reject(
          new Error(
            `PowerShell process timed out after ${timeoutMs}ms (terminated)`
          )
        );
      } else {
        resolve({ stdout, stderr });
      }
    });
  });
}

export class WindowsPlatformAdapter implements IPlatformAdapter {
  public readonly platform: SupportedPlatform = 'win32';
  public readonly platformName = 'Windows';

  public isHardwareDetectionValidated(): boolean {
    return true; // Reference implementation
  }

  public getSupportStatusMessage(): string {
    return 'Fully validated Windows reference implementation.';
  }

  public getDefaultDataDirectory(): string {
    // In production, use standard Windows %APPDATA%\DeroVault.
    // If running in development repo, preserve local .dero_vault.
    const isProd = process.env.NODE_ENV === 'production';
    const appData = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
    const prodPath = path.join(appData, 'DeroVault');

    if (isProd || (!fs.existsSync(path.resolve(process.cwd(), '.dero_vault')) && fs.existsSync(appData))) {
      return prodPath;
    }
    return path.resolve(process.cwd(), '.dero_vault');
  }

  public async detectExternalDrives(): Promise<PlatformDriveInfo[]> {
    console.log(`[Adapter] [${new Date().toISOString()}] Starting multi-tier storage detection`);
    console.log(`[Adapter] [${new Date().toISOString()}] Entering Tier 1 (Storage Cmdlets: Get-Disk | Get-Partition)`);
    console.log(`[Adapter] [${new Date().toISOString()}] Entering Tier 2 (Standard WMI Association: Win32_DiskPartition -> Win32_LogicalDisk)`);
    console.log(`[Adapter] [${new Date().toISOString()}] Entering Tier 3 (Non-Elevated GPT/Correlation: DiskIndex & partition matching)`);
    console.log(`[Adapter] [${new Date().toISOString()}] Entering Tier 4 (DriveType=2 Removable Fallback)`);

    // Verified Windows PowerShell detection logic with multi-tier logging and bounded CIM timeouts.
    const psScript = [
      "$ErrorActionPreference = 'SilentlyContinue'",
      "$systemDrive = if ($env:SystemDrive) { $env:SystemDrive.TrimEnd(':') } else { 'C' }",
      "$results = New-Object System.Collections.Generic.List[PSCustomObject]",
      "$diagnostics = New-Object System.Collections.Generic.List[string]",
      "$processedLetters = New-Object 'System.Collections.Generic.HashSet[string]' ([System.StringComparer]::OrdinalIgnoreCase)",
      "$logMap = @{}",
      "try {",
      "  Get-CimInstance Win32_LogicalDisk -OperationTimeoutSec 5 | ForEach-Object {",
      "    $cleanKey = $_.DeviceID.TrimEnd(':')",
      "    if ($cleanKey -and $cleanKey -ne $systemDrive) {",
      "      $logMap[$cleanKey] = $_",
      "    }",
      "  }",
      "} catch { $diagnostics.Add(\"LogicalDisk query failed: $($_.Exception.Message)\") }",
      "$usbDisks = @()",
      "$usbDiskIndices = New-Object 'System.Collections.Generic.HashSet[uint32]'",
      "try {",
      "  $usbDisks = @(Get-CimInstance Win32_DiskDrive -OperationTimeoutSec 5 | Where-Object {",
      "    $_.InterfaceType -eq 'USB' -or",
      "    $_.PNPDeviceID -match 'USBSTOR|USB\\\\|SCSI\\\\DISK&VEN_.*USB' -or",
      "    $_.Caption -match 'USB' -or",
      "    $_.Model -match 'USB'",
      "  })",
      "  foreach ($d in $usbDisks) {",
      "    if ($null -ne $d.Index) {",
      "      $null = $usbDiskIndices.Add([uint32]$d.Index)",
      "    }",
      "  }",
      "  $diagnostics.Add(\"Physical USB disk scan: detected $($usbDisks.Count) disk(s) via Win32_DiskDrive\")",
      "} catch { $diagnostics.Add(\"Physical USB scan failed: $($_.Exception.Message)\") }",
      "# Tier 1: Storage Cmdlets (Get-Disk & Get-Partition with ASCII drive-letter validation)",
      "try {",
      "  $storageUsbDisks = @(Get-Disk -ErrorAction SilentlyContinue | Where-Object { $_.BusType -eq 'USB' })",
      "  $t1Count = 0",
      "  foreach ($disk in $storageUsbDisks) {",
      "    $partitions = Get-Partition -DiskNumber $disk.Number -ErrorAction SilentlyContinue",
      "    foreach ($part in $partitions) {",
      "      $ch = if ($part.DriveLetter) { [char]$part.DriveLetter } else { [char]0 }",
      "      if ([int]$ch -ge 65 -and [int]$ch -le 90) {",
      "        $letter = [string]$ch",
      "        if ($letter -ne $systemDrive -and (-not $processedLetters.Contains($letter))) {",
      "          $null = $processedLetters.Add($letter)",
      "          $log = $logMap[$letter]",
      "          $volSerial = if ($log -and $log.VolumeSerialNumber) { $log.VolumeSerialNumber } else { $null }",
      "          $volName = if ($log -and $log.VolumeName) { $log.VolumeName } else { '' }",
      "          $size = if ($log -and $log.Size) { [int64]$log.Size } else { [int64]$part.Size }",
      "          $free = if ($log -and $log.FreeSpace) { [int64]$log.FreeSpace } else { 0 }",
      "          $fs = if ($log -and $log.FileSystem) { $log.FileSystem } else { 'FAT32' }",
      "          $model = if ($disk.FriendlyName) { $disk.FriendlyName } else { 'USB Storage Device' }",
      "          $results.Add([PSCustomObject]@{",
      "            DeviceID           = \"$($letter):\"",
      "            VolumeSerialNumber = $volSerial",
      "            VolumeName         = $volName",
      "            Size               = $size",
      "            FreeSpace          = $free",
      "            FileSystem         = $fs",
      "            Model              = $model",
      "            PhysicalSerial     = $disk.SerialNumber",
      "            PNPDeviceID        = $null",
      "            BusType            = 'USB'",
      "            IsRemovable        = $true",
      "          })",
      "          $t1Count++",
      "        }",
      "      }",
      "    }",
      "  }",
      "  $diagnostics.Add(\"Tier 1 (Elevated Storage Module: Get-Disk | Get-Partition): matched $t1Count volume(s)\")",
      "} catch { $diagnostics.Add(\"Tier 1 (Elevated Storage Module): not available or failed: $($_.Exception.Message)\") }",
      "# Tier 2: WMI DiskPartition Association (MBR & supported GPT)",
      "try {",
      "  $t2Count = 0",
      "  foreach ($disk in $usbDisks) {",
      "    $partitions = Get-CimAssociatedInstance -InputObject $disk -ResultClassName Win32_DiskPartition -OperationTimeoutSec 5",
      "    foreach ($part in $partitions) {",
      "      $logicalDisks = Get-CimAssociatedInstance -InputObject $part -ResultClassName Win32_LogicalDisk -OperationTimeoutSec 5",
      "      foreach ($log in $logicalDisks) {",
      "        $letter = $log.DeviceID.TrimEnd(':')",
      "        if ($letter -and $letter -ne $systemDrive -and (-not $processedLetters.Contains($letter))) {",
      "          $null = $processedLetters.Add($letter)",
      "          $results.Add([PSCustomObject]@{",
      "            DeviceID           = $log.DeviceID",
      "            VolumeSerialNumber = $log.VolumeSerialNumber",
      "            VolumeName         = $log.VolumeName",
      "            Size               = [int64]$log.Size",
      "            FreeSpace          = [int64]$log.FreeSpace",
      "            FileSystem         = $log.FileSystem",
      "            Model              = if ($disk.Model) { $disk.Model } else { 'USB Storage Device' }",
      "            PhysicalSerial     = $disk.SerialNumber",
      "            PNPDeviceID        = $disk.PNPDeviceID",
      "            BusType            = 'USB'",
      "            IsRemovable        = $true",
      "          })",
      "          $t2Count++",
      "        }",
      "      }",
      "    }",
      "  }",
      "  $diagnostics.Add(\"Tier 2 (Standard WMI Association: Win32_DiskPartition -> Win32_LogicalDisk): matched $t2Count volume(s)\")",
      "} catch { $diagnostics.Add(\"Tier 2 (Standard WMI Association) failed: $($_.Exception.Message)\") }",
      "# Tier 3: Non-elevated GPT partition / physical drive correlation for bootable media & USB SSDs",
      "try {",
      "  $t3Count = 0",
      "  if ($usbDiskIndices.Count -gt 0) {",
      "    $allParts = Get-CimInstance Win32_DiskPartition -OperationTimeoutSec 5 | Where-Object { $usbDiskIndices.Contains($_.DiskIndex) }",
      "    foreach ($letter in $logMap.Keys) {",
      "      if (-not $processedLetters.Contains($letter)) {",
      "        $log = $logMap[$letter]",
      "        $matchedDisk = $null",
      "        foreach ($d in $usbDisks) {",
      "          $diskParts = @($allParts | Where-Object { $_.DiskIndex -eq $d.Index })",
      "          foreach ($dp in $diskParts) {",
      "            $diff = [Math]::Abs([int64]$dp.Size - [int64]$log.Size)",
      "            if ($diff -lt 524288000 -or ($diskParts.Count -eq 1 -and [int64]$log.Size -le [int64]$d.Size)) {",
      "              $matchedDisk = $d",
      "              break",
      "            }",
      "          }",
      "          if ($matchedDisk) { break }",
      "        }",
      "        if ($matchedDisk -or $log.DriveType -eq 2) {",
      "          $null = $processedLetters.Add($letter)",
      "          $results.Add([PSCustomObject]@{",
      "            DeviceID           = $log.DeviceID",
      "            VolumeSerialNumber = $log.VolumeSerialNumber",
      "            VolumeName         = $log.VolumeName",
      "            Size               = [int64]$log.Size",
      "            FreeSpace          = [int64]$log.FreeSpace",
      "            FileSystem         = $log.FileSystem",
      "            Model              = if ($matchedDisk -and $matchedDisk.Model) { $matchedDisk.Model } elseif ($log.VolumeName) { $log.VolumeName } else { 'USB Storage' }",
      "            PhysicalSerial     = if ($matchedDisk) { $matchedDisk.SerialNumber } else { $null }",
      "            PNPDeviceID        = if ($matchedDisk) { $matchedDisk.PNPDeviceID } else { $null }",
      "            BusType            = 'USB'",
      "            IsRemovable        = $true",
      "          })",
      "          $t3Count++",
      "        }",
      "      }",
      "    }",
      "  }",
      "  $diagnostics.Add(\"Tier 3 (Non-Elevated GPT/Correlation: DiskIndex & partition matching): matched $t3Count volume(s)\")",
      "} catch { $diagnostics.Add(\"Tier 3 (Non-Elevated GPT/Correlation) failed: $($_.Exception.Message)\") }",
      "# Tier 4: Fallback for traditional Removable media (DriveType = 2)",
      "try {",
      "  $t4Count = 0",
      "  foreach ($letter in $logMap.Keys) {",
      "    if (-not $processedLetters.Contains($letter)) {",
      "      $log = $logMap[$letter]",
      "      if ($log.DriveType -eq 2) {",
      "        $null = $processedLetters.Add($letter)",
      "        $results.Add([PSCustomObject]@{",
      "          DeviceID           = $log.DeviceID",
      "          VolumeSerialNumber = $log.VolumeSerialNumber",
      "          VolumeName         = $log.VolumeName",
      "          Size               = [int64]$log.Size",
      "          FreeSpace          = [int64]$log.FreeSpace",
      "          FileSystem         = $log.FileSystem",
      "          Model              = if ($log.VolumeName) { $log.VolumeName } else { 'Removable Disk' }",
      "          PhysicalSerial     = $null",
      "          PNPDeviceID        = $null",
      "          BusType            = 'USB'",
      "          IsRemovable        = $true",
      "        })",
      "        $t4Count++",
      "      }",
      "    }",
      "  }",
      "  $diagnostics.Add(\"Tier 4 (DriveType=2 Removable Fallback): matched $t4Count volume(s)\")",
      "} catch { $diagnostics.Add(\"Tier 4 (DriveType=2 Removable Fallback) failed: $($_.Exception.Message)\") }",
      "[PSCustomObject]@{ Drives = $results; Diagnostics = $diagnostics } | ConvertTo-Json -Compress -Depth 4"
    ].join('; ');

    const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
    let stdout = '';
    try {
      const result = await runPowerShellSafe(encoded, 8000);
      stdout = result.stdout;
    } catch (cmdErr: any) {
      console.warn(`[Adapter] [${new Date().toISOString()}] Multi-tier PowerShell query failed or timed out (${cmdErr.message}). Initiating rapid DriveType fallback.`);
      
      // Rapid fallback: Minimal, direct query for Removable drives (DriveType=2)
      try {
        const fallbackScript = [
          "$ErrorActionPreference = 'SilentlyContinue'",
          "$sys = if ($env:SystemDrive) { $env:SystemDrive.TrimEnd(':') } else { 'C' }",
          "$items = @()",
          "Get-CimInstance Win32_LogicalDisk -OperationTimeoutSec 2 | Where-Object { $_.DriveType -eq 2 -and $_.DeviceID.TrimEnd(':') -ne $sys } | ForEach-Object {",
          "  $items += [PSCustomObject]@{",
          "    DeviceID = $_.DeviceID",
          "    VolumeSerialNumber = $_.VolumeSerialNumber",
          "    VolumeName = $_.VolumeName",
          "    Size = [int64]$_.Size",
          "    FreeSpace = [int64]$_.FreeSpace",
          "    FileSystem = $_.FileSystem",
          "    Model = if ($_.VolumeName) { $_.VolumeName } else { 'Removable Disk' }",
          "    PhysicalSerial = $null",
          "    PNPDeviceID = $null",
          "    BusType = 'USB'",
          "    IsRemovable = $true",
          "  }",
          "}",
          "[PSCustomObject]@{ Drives = $items; Diagnostics = @('Fallback DriveType=2 executed') } | ConvertTo-Json -Compress"
        ].join('; ');
        const fallbackEncoded = Buffer.from(fallbackScript, 'utf16le').toString('base64');
        const fbResult = await runPowerShellSafe(fallbackEncoded, 4000);
        stdout = fbResult.stdout;
        console.log(`[Adapter] [${new Date().toISOString()}] Rapid fallback completed with output length ${stdout.length}`);
      } catch (fbErr: any) {
        console.error(`[Adapter] [${new Date().toISOString()}] Rapid fallback also failed: ${fbErr.message}`);
        return [];
      }
    }

    if (!stdout || !stdout.trim()) {
      console.log(`[Adapter] [${new Date().toISOString()}] Tier result: PowerShell execution yielded empty stdout.`);
      return [];
    }

    let parsed: any;
    try {
      parsed = JSON.parse(stdout.trim());
    } catch (parseErr: any) {
      console.log(`[Adapter] [${new Date().toISOString()}] Failed to parse PowerShell JSON output: ${parseErr.message}`);
      return [];
    }

    // Output all tier diagnostic logs
    const diags = Array.isArray(parsed?.Diagnostics) ? parsed.Diagnostics : [];
    for (const diag of diags) {
      console.log(`[Adapter] [${new Date().toISOString()}] ${diag}`);
    }

    let rawList: any[] = [];
    if (parsed && Array.isArray(parsed.Drives)) {
      rawList = parsed.Drives;
    } else if (Array.isArray(parsed)) {
      rawList = parsed;
    } else if (parsed && parsed.Drives) {
      rawList = [parsed.Drives];
    }

    const drives: PlatformDriveInfo[] = [];
    const systemDriveLetter = (process.env.SystemDrive || 'C:').toUpperCase();

    for (const d of rawList) {
      const rawDeviceID = (d.DeviceID || '').toUpperCase();
      const driveLetter = rawDeviceID.endsWith(':') ? rawDeviceID : `${rawDeviceID}:`;
      if (!driveLetter || driveLetter.startsWith(systemDriveLetter.slice(0, 1))) {
        continue; // Never allow internal system drive
      }

      const volSerial = (d.VolumeSerialNumber || '').trim();
      const physSerial = (d.PhysicalSerial || '').trim().replace(/[^a-zA-Z0-9_-]/g, '');
      const pnpId = (d.PNPDeviceID || '').trim();

      // Formulate unambiguous stable identity
      let stableHardwareId: string;
      if (physSerial && volSerial) {
        stableHardwareId = `USB-HW-${physSerial}-${volSerial}`;
      } else if (volSerial) {
        stableHardwareId = `USB-VOL-${volSerial}`;
      } else if (physSerial) {
        stableHardwareId = `USB-PHYS-${physSerial}`;
      } else if (pnpId) {
        const pnpClean = pnpId.replace(/[^a-zA-Z0-9]/g, '_').slice(-24);
        stableHardwareId = `USB-PNP-${pnpClean}`;
      } else if (d.VolumeName && String(d.VolumeName).trim()) {
        const cleanName = String(d.VolumeName).trim().replace(/[^a-zA-Z0-9_-]/g, '_');
        stableHardwareId = `USB-NAME-${cleanName}-${driveLetter.replace(/[^a-zA-Z0-9]/g, '')}`;
      } else {
        stableHardwareId = `USB-VOL-${driveLetter.replace(/[^a-zA-Z0-9]/g, '')}`;
      }

      const mountPath = driveLetter.endsWith('\\') ? driveLetter : `${driveLetter}\\`;

      drives.push({
        stableHardwareId,
        volumeSerial: volSerial,
        volumeLabel: d.VolumeName || (d.IsRemovable ? 'USB Drive' : 'External Hard Drive'),
        mountPath,
        driveIdentifier: driveLetter,
        totalBytes: Number(d.Size || 0),
        freeBytes: Number(d.FreeSpace || 0),
        fileSystem: d.FileSystem || 'NTFS',
        deviceModel: d.Model || (d.IsRemovable ? 'Removable USB Storage' : 'External USB Disk'),
        physicalSerial: physSerial || undefined,
        pnpDeviceId: pnpId || undefined,
        busType: d.BusType || 'USB',
        isRemovable: true,
      });
    }

    if (drives.length === 0) {
      console.log(`[Adapter] [${new Date().toISOString()}] Detection summary: All tiers attempted. Zero USB storage devices currently mounted.`);
    } else {
      console.log(`[Adapter] [${new Date().toISOString()}] Detection summary: Succeeded. Found ${drives.length} external drive(s): ${drives.map(d => `${d.driveIdentifier} [${d.stableHardwareId}]`).join(', ')}`);
    }

    return drives;
  }

  public async browseForFolder(): Promise<string | null> {
    try {
      const psScript = `Add-Type -AssemblyName System.Windows.Forms; $f = New-Object System.Windows.Forms.FolderBrowserDialog; $f.Description = 'Select Source Folder to Protect in Dero Vault'; $f.ShowNewFolderButton = $false; if ($f.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) { $f.SelectedPath } else { '' }`;
      const encoded = Buffer.from(psScript, 'utf16le').toString('base64');
      const { stdout } = await runPowerShellSafe(encoded, 60000);
      const selected = stdout ? stdout.trim() : '';
      if (selected && fs.existsSync(selected)) {
        return selected;
      }
      return null;
    } catch {
      return null;
    }
  }

  public getDefaultSourceFolders(): PlatformFolderOption[] {
    const home = os.homedir();
    const candidateFolders = [
      { name: 'Documents', path: path.join(home, 'Documents') },
      { name: 'Desktop', path: path.join(home, 'Desktop') },
      { name: 'Pictures', path: path.join(home, 'Pictures') },
      { name: 'Music', path: path.join(home, 'Music') },
      { name: 'Videos', path: path.join(home, 'Videos') },
    ];

    return candidateFolders
      .filter((f) => fs.existsSync(f.path))
      .map((f) => {
        let count = 0;
        try {
          count = fs.readdirSync(f.path).length;
        } catch {}
        return {
          name: f.name,
          path: f.path,
          fileCount: count,
        };
      });
  }
}
