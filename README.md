# Dero Vault — Version 1.0

> **Your digital granary.**  
> *Plug in. Back up. Get on with your work.*

**Supported Platforms:** Windows 10/11 (x64) [Reference Implementation] · macOS (darwin) · Linux (x64)  
**Architecture:** Shared Core with Pluggable Operating System Platform Adapters  
**Connectivity:** 100% Offline (Zero Cloud, Zero Firebase, Zero Telemetry, Zero Remote Accounts)

---

## 1. What is Dero Vault?

Dero Vault is a simple, local-first automatic backup application. Inspired by the traditional East African granary (*dero*)—a secure structure crafted to protect valuable agricultural reserves for future seasons—Dero Vault safeguards your valuable digital work automatically the moment you plug in a registered removable drive.

### Core Philosophy
* **Make the safe action the lazy action**: No manual backup menus, no complex synchronization rules, and no forgotten schedules. Plug in your registered drive, and Dero Vault automatically initiates incremental protection.
* **Source Safety First**: Strictly one-directional (**SOURCE → DESTINATION**). Dero Vault never deletes, modifies, renames, or overwrites files on your source computer.
* **Stable Hardware Identification**: Drives are identified using permanent hardware and volume serial numbers (e.g., `8A23-F41C`) rather than volatile Windows drive letters (`E:`, `G:`) or ephemeral mount paths.
* **Incremental & Versioned**: Only modified or newly created files are copied. Prior revisions are archived in `DERO_VAULT_BACKUP/VERSIONS/YYYY-MM-DD` rather than overwritten.
* **100% Offline & Private**: Zero cloud services, zero analytics, zero external network requests. Your data remains strictly on your computer and your physical backup drives.

---

## 2. Cross-Platform Core Architecture

Dero Vault uses **ONE shared core** with operating-system-specific adapters underneath:

```text
Dero Vault
│
├── Shared Core
│   ├── Backup Engine (Chunked streaming, atomic .dero_part staging, speed & ETA telemetry)
│   ├── Incremental Comparison (mtime & size verification, version archiving)
│   ├── Atomic Staging & Recovery (Crash-resilient rename, orphaned partial cleanup)
│   ├── Collision-Safe Version History (Timestamped revisions in DERO_VAULT_BACKUP/VERSIONS)
│   ├── SHA-256 Checksum Verification (Post-write data integrity check)
│   ├── Backup Profiles & Drive Registration (Persistent source folder associations)
│   ├── Local Database (Crash-safe JSON WAL storage in platform data directory)
│   └── Shared Desktop GUI (React 19 SPA)
│
└── Platform Layer (server/platform/)
    ├── Windows Adapter (Reference Implementation — Verified)
    │   • PowerShell CIM/WMI query for USB Mass Storage & USB External Enclosures
    │   • Hardware serial + Volume serial stable identity formulation
    │   • Native Windows FolderBrowserDialog
    │   • Standard AppData storage path
    │
    ├── macOS Adapter (SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED)
    │   • Real /Volumes directory inspection and diskutil info queries
    │   • Volume UUID hardware identity formulation
    │   • AppleScript / osascript native folder picker
    │   • Standard ~/Library/Application Support/DeroVault storage path
    │
    └── Linux Adapter (SUPPORTED ARCHITECTURALLY — NOT YET PHYSICALLY VALIDATED)
        • Real block device discovery via lsblk JSON & /media mounts
        • UUID hardware identity formulation
        • Native zenity / kdialog folder pickers
        • Standard ~/.config/dero-vault storage path
```

---

## 3. How to Build Locally

### Prerequisites
* Node.js 18.x or 20.x
* npm 9+

### Build Steps

1. **Install dependencies**:
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Verify TypeScript compilation**:
   ```bash
   npm run lint
   ```

3. **Compile production bundles** (Frontend and Embedded Server):
   ```bash
   npm run build
   ```

4. **Package desktop application for your platform**:
   * **Windows (x64)**:
     ```bash
     npm run package:win
     ```
     *Produces `release/DeroVault-Setup.exe` and portable ZIP archive.*
   * **macOS**:
     ```bash
     npm run package:mac
     ```
     *Produces `release/DeroVault-1.0.0-mac.dmg` and ZIP archive.*
   * **Linux**:
     ```bash
     npm run package:linux
     ```
     *Produces `release/DeroVault-1.0.0-linux.AppImage` and `.deb`.*

---

## 4. Multi-Platform GitHub Actions Automation

Automated continuous integration and release workflows are defined in:
* `.github/workflows/build-cross-platform.yml`
* `.github/workflows/build-windows.yml`

### Pipeline Execution
* **Windows Job** runs on `windows-latest` → packages Windows x64 NSIS installer and portable ZIP.
* **macOS Job** runs on `macos-latest` → packages macOS DMG and ZIP.
* **Linux Job** runs on `ubuntu-latest` → packages Linux AppImage and DEB.

All artifacts are uploaded automatically to GitHub Actions storage upon pipeline completion.

---

## 5. Testing Scope & Verification Discipline

### Automated & Synthetically Verified Capabilities
The following software components have been validated in the automated build environment:
* TypeScript compilation and static type checking (`tsc --noEmit`).
* Production client bundling via Vite and embedded server bundling via esbuild.
* Platform service detection (`os.platform()` runtime adapter routing).
* Cross-platform normalized drive model and path resolution.
* Incremental file comparison logic (evaluating new, modified, unchanged files).
* Atomic file copy staging (writing to `.dero_part` files before atomic rename).
* SHA-256 checksum generation and byte-level verification.
* Historical session recording and crash-safe JSON database persistence.

### Physical Hardware Tests Requiring Physical Testing
In accordance with strict verification standards, **the following operations cannot be validated in virtual or simulated container environments and require physical hardware testing**:
1. **Windows Physical Testing**: Validating real USB flash drives, USB HDDs, and USB SSDs across USB 2.0/3.0 ports on Windows 10/11.
2. **macOS Physical Testing**: Validating USB drive insertion, `/Volumes` mounting, and volume UUID persistence on real Apple hardware.
3. **Linux Physical Testing**: Validating real udev/lsblk notifications and desktop automounts across Ubuntu/Fedora desktop environments.
4. **Physical Disconnection Mid-Transfer**: Physically unplugging external drives during an active data copy to confirm graceful error capture and partial file rollback.
5. **Reconnection Auto-Resume**: Physically reconnecting a drive to confirm automatic incremental catch-up.
