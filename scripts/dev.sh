#!/bin/bash
# Development server - runs without launchd

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "  iCloud Sync Monitor - Dev Server"
echo "========================================"
echo ""
echo "Dashboard: http://127.0.0.1:8430"
echo "WebSocket: ws://127.0.0.1:8431"
echo ""
echo "Press Ctrl+C to stop"
echo ""

cd "$PROJECT_DIR"
OPEN_BROWSER=true .venv/bin/python src/server.py
