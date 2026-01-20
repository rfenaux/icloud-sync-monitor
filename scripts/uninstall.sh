#!/bin/bash
# Uninstall iCloud Sync Monitor

set -e

PLIST_NAME="com.raphael.icloud-sync-monitor.plist"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "========================================"
echo "  iCloud Sync Monitor - Uninstall"
echo "========================================"
echo ""

# Stop and unload service
if launchctl list | grep -q "com.raphael.icloud-sync-monitor"; then
    echo "Stopping service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Remove plist
if [[ -f "$PLIST_DEST" ]]; then
    echo "Removing LaunchAgent..."
    rm "$PLIST_DEST"
fi

echo ""
echo "========================================"
echo "  Uninstall Complete!"
echo "========================================"
echo ""
echo "The service has been stopped and removed from auto-start."
echo "The project files remain in place."
echo ""
echo "To reinstall: ./scripts/install.sh"
