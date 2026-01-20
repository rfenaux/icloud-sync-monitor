#!/bin/bash
# Install iCloud Sync Monitor

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PLIST_NAME="com.raphael.icloud-sync-monitor.plist"
PLIST_SOURCE="$PROJECT_DIR/launchd/$PLIST_NAME"
PLIST_DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

echo "========================================"
echo "  iCloud Sync Monitor - Installation"
echo "========================================"
echo ""

# Check macOS
if [[ "$(uname)" != "Darwin" ]]; then
    echo "Error: This tool only runs on macOS"
    exit 1
fi

# Check Python 3
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required"
    exit 1
fi

echo "1. Checking Python version..."
python3 --version

# Create logs directory
echo "2. Creating logs directory..."
mkdir -p "$PROJECT_DIR/logs"

# Install dependencies
echo "3. Installing Python dependencies..."
python3 -m pip install --quiet websockets

# Stop existing service if running
if launchctl list | grep -q "com.raphael.icloud-sync-monitor"; then
    echo "4. Stopping existing service..."
    launchctl unload "$PLIST_DEST" 2>/dev/null || true
fi

# Copy plist
echo "5. Installing LaunchAgent..."
mkdir -p "$HOME/Library/LaunchAgents"
cp "$PLIST_SOURCE" "$PLIST_DEST"

# Load service
echo "6. Starting service..."
launchctl load "$PLIST_DEST"

echo ""
echo "========================================"
echo "  Installation Complete!"
echo "========================================"
echo ""
echo "Dashboard: http://127.0.0.1:8430"
echo "WebSocket: ws://127.0.0.1:8431"
echo ""
echo "The dashboard will open in your browser automatically."
echo ""
echo "To uninstall: ./scripts/uninstall.sh"
echo "To view logs: tail -f logs/stdout.log"
echo ""

# Open browser
sleep 2
open "http://127.0.0.1:8430"
