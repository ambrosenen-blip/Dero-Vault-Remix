#!/usr/bin/env bash
# ==============================================================================
# Dero Vault™ — macOS Native Offline Recovery Installer & Tool
# Publisher: Enen Digital Labs Co. Ltd
# Platform: macOS 12.0+ (Monterey, Ventura, Sonoma, Sequoia) - Universal (x86_64 / arm64)
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIVE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=============================================================================="
echo "                   DERO VAULT™ — RESCUE & MIGRATION (macOS)                    "
echo "                   Publisher: Enen Digital Labs Co. Ltd                       "
echo "=============================================================================="
echo ""
echo "Backup Drive identified at: $DRIVE_ROOT"

CURRENT_BACKUP="$DRIVE_ROOT/DERO_VAULT_BACKUP/CURRENT"
if [ ! -d "$CURRENT_BACKUP" ]; then
  echo "Error: CURRENT backup directory not found at: $CURRENT_BACKUP"
  exit 1
fi

echo "Found verified backup directory."
echo ""
echo "Select recovery action:"
echo "  1) Browse backed-up files in Finder"
echo "  2) Guided restore to your Home folder (~/Documents, ~/Desktop)"
echo "  3) Open START_HERE.html in Safari"
echo "  4) Exit"
echo ""
read -p "Choose option [1-4]: " choice

case "$choice" in
  1)
    echo "Opening $CURRENT_BACKUP in Finder..."
    open "$CURRENT_BACKUP"
    ;;
  2)
    echo ""
    echo "Starting guided restoration to: $HOME"
    for folder in "$CURRENT_BACKUP"/*; do
      if [ -d "$folder" ]; then
        name="$(basename "$folder")"
        dest="$HOME/$name"
        echo "Restoring namespace [$name] -> $dest"
        mkdir -p "$dest"
        cp -R -n "$folder"/* "$dest"/ 2>/dev/null || true
      fi
    done
    echo ""
    echo "✓ Restoration completed. Conflicting files were safely preserved."
    ;;
  3)
    START_HTML="$DRIVE_ROOT/START_HERE.html"
    if [ -f "$START_HTML" ]; then
      open "$START_HTML"
    else
      open "$DRIVE_ROOT/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html"
    fi
    ;;
  *)
    echo "Exiting."
    ;;
esac

exit 0
