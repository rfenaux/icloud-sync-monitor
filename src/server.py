#!/usr/bin/env python3
"""iCloud Sync Monitor - Main HTTP and WebSocket server.

Serves the dashboard and provides REST API for sync status.
WebSocket pushes live updates to connected clients.

CRITICAL: All data collection is read-only and non-blocking.
"""

import asyncio
import json
import logging
import os
import signal
import subprocess
import sys
import webbrowser
from datetime import datetime
from http.server import HTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from threading import Thread
from typing import Optional
from urllib.parse import parse_qs, urlparse

# Add src to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent))

from src.config import HOST, PORT, STATIC_DIR, LOGS_DIR, DASHBOARD_URL, WS_PUSH_INTERVAL
from src.collectors.sqlite_reader import SQLiteReader
from src.collectors.brctl_runner import BrctlRunner

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(LOGS_DIR / "server.log") if LOGS_DIR.exists() else logging.StreamHandler(),
    ],
)
logger = logging.getLogger("icloud-monitor")

# Global state
sqlite_reader = SQLiteReader()
brctl_runner = BrctlRunner()
connected_websockets: set = set()
cached_data: dict = {}
last_quota_fetch: Optional[datetime] = None


def fetch_and_cache_quota() -> dict:
    """Fetch quota and update cache. Returns quota dict."""
    global last_quota_fetch, cached_data
    quota = brctl_runner.get_quota()
    if quota:
        cached_data["quota"] = quota
        last_quota_fetch = datetime.now()
        return quota
    return cached_data.get("quota", {"remaining_bytes": None, "remaining_human": "Unknown"})


class DashboardHandler(SimpleHTTPRequestHandler):
    """HTTP request handler for dashboard and API."""

    def __init__(self, *args, **kwargs):
        # Serve static files from STATIC_DIR
        super().__init__(*args, directory=str(STATIC_DIR), **kwargs)

    def log_message(self, format, *args):
        """Override to use our logger."""
        logger.debug(f"{self.address_string()} - {format % args}")

    def do_GET(self):
        """Handle GET requests."""
        parsed = urlparse(self.path)
        path = parsed.path

        # API routes
        if path == "/api/status":
            self._send_json(self._get_status())
        elif path == "/api/downloads":
            self._send_json(self._get_downloads())
        elif path == "/api/uploads":
            self._send_json(self._get_uploads())
        elif path == "/api/errors":
            self._send_json(self._get_errors())
        elif path == "/api/quota":
            self._send_json(self._get_quota())
        elif path == "/api/containers":
            self._send_json(self._get_containers())
        elif path == "/health":
            self._send_json({"status": "ok", "timestamp": datetime.now().isoformat()})
        elif path == "/" or path == "/index.html":
            # Serve dashboard
            self.path = "/index.html"
            super().do_GET()
        else:
            # Serve static files
            super().do_GET()

    def do_POST(self):
        """Handle POST requests for actions."""
        parsed = urlparse(self.path)
        path = parsed.path

        # Read request body
        content_length = int(self.headers.get("Content-Length", 0))
        body = self.rfile.read(content_length).decode("utf-8") if content_length else "{}"
        try:
            data = json.loads(body) if body else {}
        except json.JSONDecodeError:
            data = {}

        if path == "/api/actions/download":
            file_path = data.get("path")
            if not file_path:
                self._send_json({"success": False, "message": "Path required"}, status=400)
                return
            success, message = brctl_runner.force_download(file_path)
            self._send_json({"success": success, "message": message})

        elif path == "/api/actions/evict":
            file_path = data.get("path")
            if not file_path:
                self._send_json({"success": False, "message": "Path required"}, status=400)
                return
            success, message = brctl_runner.evict_file(file_path)
            self._send_json({"success": success, "message": message})

        elif path == "/api/actions/restart-bird":
            confirm = data.get("confirm", False)
            if not confirm:
                self._send_json({
                    "success": False,
                    "message": "Confirmation required",
                    "requires_confirm": True,
                }, status=400)
                return
            success, message = brctl_runner.restart_bird()
            self._send_json({"success": success, "message": message})

        else:
            self._send_json({"error": "Not found"}, status=404)

    def _send_json(self, data: dict, status: int = 200):
        """Send JSON response."""
        response = json.dumps(data, indent=2)
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(response))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(response.encode())

    def _get_status(self) -> dict:
        """Get overall sync status summary."""
        summary = sqlite_reader.get_summary()
        quota = self._get_quota()
        summary["quota"] = quota
        return summary

    def _get_downloads(self) -> dict:
        """Get active downloads."""
        active = sqlite_reader.get_active_downloads()
        counts = sqlite_reader.get_download_counts()
        return {
            "active": active,
            "counts": counts,
            "timestamp": datetime.now().isoformat(),
        }

    def _get_uploads(self) -> dict:
        """Get active uploads."""
        active = sqlite_reader.get_active_uploads()
        counts = sqlite_reader.get_upload_counts()
        return {
            "active": active,
            "counts": counts,
            "timestamp": datetime.now().isoformat(),
        }

    def _get_errors(self) -> dict:
        """Get recent errors."""
        errors = sqlite_reader.get_recent_errors()
        return {
            "errors": errors,
            "total": len(errors),
            "timestamp": datetime.now().isoformat(),
        }

    def _get_quota(self) -> dict:
        """Get quota (with caching)."""
        global last_quota_fetch, cached_data

        # Cache quota for 5 minutes
        now = datetime.now()
        if last_quota_fetch and (now - last_quota_fetch).total_seconds() < 300:
            if "quota" in cached_data:
                return cached_data["quota"]

        return fetch_and_cache_quota()

    def _get_containers(self) -> dict:
        """Get container status."""
        raw = brctl_runner.get_status()
        containers = brctl_runner.parse_container_status(raw) if raw else []
        return {
            "containers": containers,
            "total": len(containers),
            "timestamp": datetime.now().isoformat(),
        }


def run_http_server():
    """Run the HTTP server."""
    server = HTTPServer((HOST, PORT), DashboardHandler)
    logger.info(f"HTTP server running at {DASHBOARD_URL}")
    server.serve_forever()


async def websocket_handler(websocket):
    """Handle WebSocket connections."""
    connected_websockets.add(websocket)
    logger.info(f"WebSocket client connected. Total: {len(connected_websockets)}")
    try:
        # Send initial state
        status = sqlite_reader.get_summary()
        status["quota"] = fetch_and_cache_quota()
        await websocket.send(json.dumps({"event": "sync_update", "data": status}))

        # Keep connection alive and handle incoming messages
        async for message in websocket:
            try:
                data = json.loads(message)
                # Handle any client commands if needed
                if data.get("type") == "ping":
                    await websocket.send(json.dumps({"type": "pong"}))
            except json.JSONDecodeError:
                pass
    except Exception as e:
        logger.debug(f"WebSocket error: {e}")
    finally:
        connected_websockets.discard(websocket)
        logger.info(f"WebSocket client disconnected. Total: {len(connected_websockets)}")


async def broadcast_updates():
    """Periodically broadcast updates to all connected WebSocket clients."""
    # Refresh quota every 5 minutes during broadcasts
    quota_refresh_counter = 0
    while True:
        await asyncio.sleep(WS_PUSH_INTERVAL)
        if connected_websockets:
            status = sqlite_reader.get_summary()
            # Refresh quota every 60 broadcasts (5 min at 5s interval)
            quota_refresh_counter += 1
            if quota_refresh_counter >= 60 or "quota" not in cached_data:
                fetch_and_cache_quota()
                quota_refresh_counter = 0
            status["quota"] = cached_data.get("quota", {"remaining_bytes": None, "remaining_human": "Unknown"})
            message = json.dumps({"event": "sync_update", "data": status})
            await asyncio.gather(
                *[ws.send(message) for ws in connected_websockets],
                return_exceptions=True,
            )


async def run_websocket_server():
    """Run the WebSocket server."""
    try:
        import websockets
        async with websockets.serve(websocket_handler, HOST, PORT + 1):
            logger.info(f"WebSocket server running at ws://{HOST}:{PORT + 1}")
            await broadcast_updates()
    except ImportError:
        logger.warning("websockets package not installed - WebSocket disabled")
        while True:
            await asyncio.sleep(60)


def open_browser():
    """Open dashboard in default browser."""
    try:
        webbrowser.open(DASHBOARD_URL)
        logger.info(f"Opened browser to {DASHBOARD_URL}")
    except Exception as e:
        logger.warning(f"Could not open browser: {e}")


def main():
    """Main entry point."""
    logger.info("=" * 50)
    logger.info("iCloud Sync Monitor starting...")
    logger.info(f"Dashboard: {DASHBOARD_URL}")
    logger.info(f"WebSocket: ws://{HOST}:{PORT + 1}")
    logger.info("=" * 50)

    # Check if CloudDocs database exists
    from src.config import CLOUDDOCS_DB
    if not CLOUDDOCS_DB.exists():
        logger.error(f"CloudDocs database not found: {CLOUDDOCS_DB}")
        logger.error("Make sure iCloud Drive is enabled and has synced at least once.")
        sys.exit(1)

    # Initialize quota cache on startup
    logger.info("Fetching initial quota...")
    quota = fetch_and_cache_quota()
    logger.info(f"Quota: {quota.get('remaining_human', 'Unknown')}")

    # Handle shutdown gracefully
    def shutdown(signum, frame):
        logger.info("Shutting down...")
        sys.exit(0)

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    # Open browser if OPEN_BROWSER env var is set (for launchd)
    if os.environ.get("OPEN_BROWSER", "").lower() in ("1", "true", "yes"):
        # Delay browser open to let server start
        from threading import Timer
        Timer(2.0, open_browser).start()

    # Start HTTP server in a thread
    http_thread = Thread(target=run_http_server, daemon=True)
    http_thread.start()

    # Run WebSocket server in async loop
    try:
        asyncio.run(run_websocket_server())
    except KeyboardInterrupt:
        logger.info("Shutting down...")


if __name__ == "__main__":
    main()
