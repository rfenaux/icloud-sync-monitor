# iCloud Sync Monitor

A macOS dashboard for monitoring iCloud Drive sync activity with real-time visibility into uploads, downloads, errors, and storage quota.

## Features

- **Real-time sync status** - See active uploads and downloads
- **Error visibility** - View recent sync errors with timestamps
- **Quota monitoring** - Track remaining iCloud storage
- **Action buttons** - Force download, evict files, restart sync
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
