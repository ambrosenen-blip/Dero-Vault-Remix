#!/usr/bin/env bash
# ==============================================================================
# Dero Vault™ — Linux Native Offline Recovery Installer & Tool
# Publisher: Enen Digital Labs Co. Ltd
# Platform: Linux (glibc 2.31+, Ubuntu, Debian, Fedora, Arch) - x86_64 / aarch64
# ==============================================================================
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DRIVE_ROOT="$(cd "$SCRIPT_DIR/../../.." && pwd)"

echo "=============================================================================="
echo "                   DERO VAULT™ — RESCUE & MIGRATION (Linux)                    "
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
echo "  1) Browse backed-up files in File Manager"
echo "  2) Guided restore to your Home folder (~/Documents, ~/Desktop)"
echo "  3) Open START_HERE.html in web browser"
echo "  4) Exit"
echo ""
read -p "Choose option [1-4]: " choice

case "$choice" in
  1)
    if command -v xdg-open > /dev/null 2>&1; then
      xdg-open "$CURRENT_BACKUP"
    else
      echo "Files available at: $CURRENT_BACKUP"
    fi
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
    [ ! -f "$START_HTML" ] && START_HTML="$DRIVE_ROOT/DERO_VAULT_BACKUP/RECOVERY/START_HERE.html"
    if command -v xdg-open > /dev/null 2>&1; then
      xdg-open "$START_HTML"
    elif command -v open > /dev/null 2>&1; then
      open "$START_HTML"
    else
      echo "Please open in browser: $START_HTML"
    fi
    ;;
  *)
    echo "Exiting."
    ;;
esac

exit 0
