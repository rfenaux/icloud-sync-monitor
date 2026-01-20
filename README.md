# iCloud Sync Monitor

A macOS dashboard for monitoring iCloud Drive sync activity with real-time visibility into uploads, downloads, errors, and storage quota.

## Features

### Core Monitoring
- **Real-time sync status** - See active uploads and downloads
- **Error visibility** - View recent sync errors with timestamps
- **Quota monitoring** - Track remaining iCloud storage
- **Stuck file detection** - Alerts for files not progressing
- **Container status** - See sync state per iCloud container

### UI/UX (Sprint 1)
- **Keyboard shortcuts** - Quick actions with hotkeys (press `?` for help)
- **Search & filters** - Find files by name, type, or status
- **Sound alerts** - Audio notifications for sync events
- **Dark mode** - Toggle between light and dark themes

### Automation (Sprint 4)
- **Auto-fix rules** - Automatically retry stuck downloads based on configurable rules
- **Sync pause/resume** - Temporarily pause iCloud sync with optional auto-resume timer

### Actions
- **Force download** - Download a specific file from iCloud
- **Evict file** - Remove local copy, keep in iCloud
- **Restart sync** - Restart the bird daemon (use with caution)

### System
- **Auto-start** - Runs at boot via launchd
- **Non-blocking** - Never interferes with iCloud sync

## Screenshots

```
┌─────────────────────────────────────────────────────────────┐
│  iCloud Sync Monitor                     ● Connected  8430  │
├─────────────────────────────────────────────────────────────┤
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ ↓ Downloads │  │ ↑ Uploads   │  │ ⚠ Errors    │         │
│  │     127     │  │     112     │  │      3      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

## Installation

```bash
# Clone the repository
git clone https://github.com/rfenaux/icloud-sync-monitor.git
cd icloud-sync-monitor

# Run the install script
./scripts/install.sh
```

This will:
1. Install Python dependencies (websockets)
2. Set up a LaunchAgent for auto-start
3. Open the dashboard in your browser

## Usage

- **Dashboard**: http://127.0.0.1:8430
- **WebSocket**: ws://127.0.0.1:8431 (for live updates)

### Actions

- **Force Download** - Download a specific file from iCloud
- **Evict File** - Remove local copy, keep in iCloud
- **Restart Sync** - Restart the bird daemon (use with caution)

## Development

```bash
# Run without launchd
./scripts/dev.sh

# View logs
tail -f logs/stdout.log
```

## Uninstall

```bash
./scripts/uninstall.sh
```

## API Reference

### Status Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/status` | GET | Overall sync summary |
| `/api/downloads` | GET | Active downloads list |
| `/api/uploads` | GET | Active uploads list |
| `/api/errors` | GET | Recent errors |
| `/api/quota` | GET | Storage quota |
| `/api/containers` | GET | Container status |

### Rules Endpoints (Sprint 4)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rules` | GET | List all rules with stats |
| `/api/rules` | POST | Create new rule |
| `/api/rules/<id>` | PUT | Update rule |
| `/api/rules/<id>` | DELETE | Delete rule |
| `/api/rules/<id>/toggle` | POST | Enable/disable rule |
| `/api/rules/log` | GET | Execution history |

### Sync Control Endpoints (Sprint 4)
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/sync/status` | GET | Pause state and countdown |
| `/api/sync/pause` | POST | Pause sync (optional `duration_minutes`) |
| `/api/sync/resume` | POST | Resume sync |
| `/api/sync/extend` | POST | Extend pause duration |

### Action Endpoints
| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/actions/download` | POST | Force download file |
| `/api/actions/evict` | POST | Evict local copy |
| `/api/actions/restart-bird` | POST | Restart sync daemon |

## How It Works

The monitor reads from:
- CloudDocs SQLite database (read-only mode)
- `brctl` command output for container status

**Safety guarantees:**
- SQLite opened in read-only mode (`?mode=ro`)
- 1 second busy timeout (gives up quickly if database is locked)
- 5-10 second timeouts on all subprocess calls
- Low priority I/O and CPU scheduling via launchd

## Requirements

- macOS 12+ (Monterey or later)
- Python 3.11+
- iCloud Drive enabled

## License

MIT License
