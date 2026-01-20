"""Configuration constants for iCloud Sync Monitor."""

from pathlib import Path

# Server settings
HOST = "127.0.0.1"
PORT = 8430
DASHBOARD_URL = f"http://{HOST}:{PORT}"

# Paths
PROJECT_ROOT = Path(__file__).parent.parent
STATIC_DIR = PROJECT_ROOT / "static"
LOGS_DIR = PROJECT_ROOT / "logs"
CONFIG_DIR = PROJECT_ROOT / "config"

# CloudDocs database path
CLOUDDOCS_DB = Path.home() / "Library/Application Support/CloudDocs/session/db/client.db"

# Polling intervals (seconds)
POLL_TRANSFERS = 5.0      # Downloads/uploads - fast updates
POLL_ERRORS = 30.0        # Errors - less urgent
POLL_QUOTA = 300.0        # Quota - slow changing (5 min)
POLL_CONTAINERS = 10.0    # Container status

# Timeouts (seconds)
SQLITE_TIMEOUT = 5.0      # SQLite connection timeout
SQLITE_BUSY_TIMEOUT = 1000  # milliseconds - give up quickly if locked
BRCTL_TIMEOUT = 10.0      # brctl command timeout

# Query limits
MAX_DOWNLOADS = 100
MAX_UPLOADS = 100
MAX_ERRORS = 50

# WebSocket
WS_PUSH_INTERVAL = 5.0    # Push updates to clients every 5s

# Throttle states (from CloudDocs)
class ThrottleState:
    IDLE = 0
    ACTIVE = 1
    # Add more as discovered

# Download kinds (from CloudDocs)
class DownloadKind:
    CONTENT = 0
    THUMBNAIL = 1
    SIDECAR = 2
