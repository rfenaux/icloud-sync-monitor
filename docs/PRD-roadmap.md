# PRD: iCloud Sync Monitor - Full Roadmap

> Created: 2026-01-20 | Version: 1.0

## Overview

This document outlines the complete feature roadmap for iCloud Sync Monitor, organized into phases by implementation complexity and user value.

---

## Completed Features

### Phase 1: MVP ✅
- Dashboard with download/upload/error counts
- iCloud quota display
- Active transfers list with file icons
- Actions: Force download, Evict file, Restart bird daemon
- WebSocket real-time updates
- LaunchAgent for auto-start

### Phase 2: Live Experience ✅
- Pulse animations on active cards
- Spinning sync icon
- Animated counter values
- Live "Updated Xs ago" timestamp
- Speed indicator (throughput)
- Activity feed with recent completions
- File type icons (emoji-based)
- Sparkline charts in cards
- Favicon badge with count
- Desktop notifications
- Toast notifications for actions

### Phase 3: Intelligence ✅
- Dark mode with system preference
- Stuck file detection (10+ min threshold)
- Health score (0-100)
- Container breakdown by app

---

## Phase 4: Search & Navigation

### 4.1 Search Functionality
**Priority:** High | **Effort:** Medium

#### Requirements
- Search input in header or dedicated section
- Real-time filtering as user types
- Search across: filename, path, container
- Highlight matching text in results
- Clear search button (Escape key)

#### Technical Design
```javascript
// Search state
let searchQuery = '';
let filteredTransfers = [];

function filterTransfers(query) {
    return allTransfers.filter(t =>
        t.filename.toLowerCase().includes(query) ||
        t.path?.toLowerCase().includes(query)
    );
}
```

#### UI Elements
- Search input with magnifying glass icon
- "X results" counter
- "Clear" button when query present

### 4.2 Filter Controls
**Priority:** High | **Effort:** Medium

#### Filter Options
| Filter | Options |
|--------|---------|
| Type | Downloads, Uploads, All |
| Status | Active, Queued, Stuck |
| Container | Dropdown of available containers |
| Size | < 1MB, 1-10MB, 10-100MB, > 100MB |
| File Type | Images, Videos, Documents, Code, Archives, Other |

#### UI Design
- Filter chips/pills below search
- Active filters highlighted
- "Clear all filters" option
- Filter state persisted in URL params

### 4.3 Keyboard Shortcuts
**Priority:** High | **Effort:** Low

#### Global Shortcuts
| Key | Action |
|-----|--------|
| `/` or `Cmd+K` | Focus search |
| `Escape` | Clear search / Close dialog |
| `T` | Toggle dark mode |
| `R` | Refresh data |
| `?` | Show keyboard shortcuts help |

#### Action Shortcuts (with confirmation)
| Key | Action |
|-----|--------|
| `D` | Open download dialog |
| `E` | Open evict dialog |
| `Shift+R` | Restart bird (requires confirm) |
| `F` | Fix all stuck files (requires confirm) |

#### Implementation
```javascript
document.addEventListener('keydown', (e) => {
    // Ignore if typing in input
    if (e.target.tagName === 'INPUT') return;

    switch(e.key) {
        case '/': focusSearch(); e.preventDefault(); break;
        case 't': toggleDarkMode(); break;
        case 'r': fetchInitialData(); break;
        case '?': showShortcutsHelp(); break;
    }
});
```

#### Help Modal
- Triggered by `?` key
- Lists all shortcuts in organized table
- Dismissible with Escape or click outside

---

## Phase 5: Data & Analytics

### 5.1 Historical Trends
**Priority:** Medium | **Effort:** High

#### Requirements
- Store sync metrics over time
- 7-day rolling window (configurable)
- SQLite database for persistence
- Time-series charts

#### Data Model
```sql
CREATE TABLE sync_metrics (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    downloads_active INTEGER,
    downloads_total INTEGER,
    uploads_active INTEGER,
    uploads_total INTEGER,
    errors_count INTEGER,
    health_score INTEGER,
    stuck_count INTEGER
);

CREATE TABLE activity_log (
    id INTEGER PRIMARY KEY,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    event_type TEXT,  -- 'download_complete', 'upload_complete', 'error', 'stuck'
    filename TEXT,
    file_size INTEGER,
    duration_seconds INTEGER
);
```

#### Charts
- Line chart: Activity over time (downloads/uploads)
- Area chart: Queue depth over time
- Bar chart: Errors by day
- Heatmap: Activity by hour of day

#### Backend Changes
```python
# New endpoint
@app.route('/api/history')
def get_history():
    # Return last 7 days of metrics
    pass

# Background task to record metrics every minute
async def record_metrics():
    while True:
        save_current_metrics_to_db()
        await asyncio.sleep(60)
```

### 5.2 Size Breakdown
**Priority:** Medium | **Effort:** Medium

#### Requirements
- Show storage usage by folder/container
- Treemap or sunburst visualization
- Drill-down capability
- "Large files" list

#### Data Source
- Parse `brctl status` for container sizes
- Use `du` command for folder sizes (with timeout)
- Cache results (refresh every 5 minutes)

#### UI Design
```
┌─────────────────────────────────────┐
│ iCloud Storage Breakdown            │
├─────────────────────────────────────┤
│ ┌─────────────┬──────────┬────────┐ │
│ │   Photos    │  iCloud  │ Other  │ │
│ │   45.2 GB   │  Drive   │  2.1GB │ │
│ │             │  12.3 GB │        │ │
│ └─────────────┴──────────┴────────┘ │
│                                     │
│ Largest Files:                      │
│ • video.mov (2.3 GB) - Photos      │
│ • backup.zip (1.1 GB) - Drive      │
└─────────────────────────────────────┘
```

### 5.3 Export Logs
**Priority:** Low | **Effort:** Low

#### Export Formats
- CSV: Activity log, error log, metrics
- JSON: Full state dump
- Text: Human-readable summary

#### UI
- "Export" button in footer or menu
- Format selection dropdown
- Date range picker (if historical data available)

#### Implementation
```javascript
function exportToCSV(data, filename) {
    const csv = convertToCSV(data);
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
}
```

---

## Phase 6: Automation & Integration

### 6.1 Auto-Fix Rules
**Priority:** Medium | **Effort:** Medium

#### Requirements
- Define rules for automatic actions
- Rule conditions: stuck time, file type, container
- Actions: retry download, notify, ignore
- Enable/disable per rule
- Execution log

#### Rule Schema
```javascript
{
    "id": "auto-retry-stuck",
    "enabled": true,
    "conditions": {
        "stuck_minutes": 30,
        "file_types": ["*"],
        "containers": ["*"]
    },
    "action": "retry_download",
    "cooldown_minutes": 60,
    "max_retries": 3
}
```

#### UI Design
- Rules list with enable/disable toggles
- "Add Rule" wizard
- Execution history log
- "Run now" button for manual trigger

### 6.2 Webhooks
**Priority:** Medium | **Effort:** Medium

#### Requirements
- Configure webhook endpoints
- Select events to trigger
- Custom payload templates
- Retry logic with backoff
- Webhook log with status

#### Webhook Events
| Event | Payload |
|-------|---------|
| `sync.started` | Queue counts |
| `sync.completed` | Duration, files synced |
| `error.new` | Error details |
| `stuck.detected` | Stuck file list |
| `health.critical` | Health score, reasons |

#### Configuration UI
```
┌─────────────────────────────────────┐
│ Webhooks                            │
├─────────────────────────────────────┤
│ + Add Webhook                       │
│                                     │
│ ┌─────────────────────────────────┐ │
│ │ Slack Notifications             │ │
│ │ https://hooks.slack.com/...     │ │
│ │ Events: error.new, stuck.detect │ │
│ │ Status: ✓ Active                │ │
│ │ [Test] [Edit] [Delete]          │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

#### Backend Implementation
```python
class WebhookManager:
    def __init__(self):
        self.webhooks = load_webhooks_from_config()

    async def trigger(self, event: str, payload: dict):
        for webhook in self.webhooks:
            if event in webhook.events:
                await self.send_webhook(webhook, event, payload)

    async def send_webhook(self, webhook, event, payload):
        # Retry with exponential backoff
        pass
```

### 6.3 Sound Alerts
**Priority:** Low | **Effort:** Low

#### Requirements
- Optional audio notifications
- Configurable sounds per event
- Volume control
- System sound integration

#### Events with Sound
| Event | Default Sound |
|-------|---------------|
| Sync complete | Chime |
| New error | Alert |
| Stuck detected | Warning |
| Health critical | Alarm |

#### Implementation
```javascript
const sounds = {
    chime: new Audio('data:audio/wav;base64,...'),
    alert: new Audio('data:audio/wav;base64,...'),
};

function playSound(type) {
    if (soundsEnabled && sounds[type]) {
        sounds[type].play();
    }
}
```

### 6.4 Sync Pause/Resume
**Priority:** Low | **Effort:** Medium

#### Requirements
- Pause all iCloud sync activity
- Visual indicator when paused
- Auto-resume option (after X minutes)
- Useful for metered connections

#### Implementation
- Use `brctl` commands if available
- Fallback: block bird daemon network (requires sudo)
- May require helper tool with elevated privileges

#### UI
- Pause/Resume button in header
- Timer showing pause duration
- Auto-resume countdown

---

## Phase 7: Advanced Features

### 7.1 File Browser
**Priority:** Low | **Effort:** High

#### Requirements
- Browse iCloud Drive folder structure
- Show sync status per file/folder
- Context menu actions (download, evict, info)
- Drag-and-drop support

#### Technical Challenges
- Performance with large folders
- Real-time status updates
- Permission handling

#### UI Design
```
┌─────────────────────────────────────┐
│ iCloud Drive Browser                │
├─────────────────────────────────────┤
│ 📁 iCloud Drive                     │
│   📁 Documents          ✓ Synced    │
│   📁 Desktop            ↓ Syncing   │
│     📄 report.pdf       ✓ Local     │
│     📄 data.xlsx        ☁️ Cloud    │
│   📁 Photos             ⚠️ Stuck    │
└─────────────────────────────────────┘
```

### 7.2 Menu Bar App
**Priority:** Low | **Effort:** Very High

#### Requirements
- Native macOS menu bar icon
- Quick status at a glance
- Dropdown with key metrics
- Click to open full dashboard

#### Technology Options
1. **SwiftUI** - Native, best integration
2. **Electron** - Easier, larger footprint
3. **Tauri** - Rust-based, lightweight
4. **rumps** - Python, simple but limited

#### Menu Bar Design
```
┌─────────────────────┐
│ ☁️ iCloud Sync      │
├─────────────────────┤
│ ↓ 3 Downloads       │
│ ↑ 1 Upload          │
│ ⚠️ 2 Stuck          │
├─────────────────────┤
│ Health: 85          │
│ Quota: 1.2 TB free  │
├─────────────────────┤
│ Open Dashboard...   │
│ Pause Sync          │
│ Preferences...      │
│ Quit                │
└─────────────────────┘
```

### 7.3 REST API Documentation
**Priority:** Low | **Effort:** Low

#### Requirements
- OpenAPI/Swagger specification
- Interactive documentation page
- Code examples (curl, Python, JS)

#### Endpoints to Document
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/status | Overall sync status |
| GET | /api/downloads | Active downloads |
| GET | /api/uploads | Active uploads |
| GET | /api/errors | Recent errors |
| GET | /api/quota | Storage quota |
| GET | /api/containers | Container status |
| GET | /api/history | Historical metrics |
| POST | /api/actions/download | Force download |
| POST | /api/actions/evict | Evict file |
| POST | /api/actions/restart-bird | Restart daemon |
| GET | /health | Health check |

---

## Implementation Priority Matrix

```
                    HIGH VALUE
                        │
    ┌───────────────────┼───────────────────┐
    │                   │                   │
    │  Keyboard         │  Historical       │
    │  Shortcuts        │  Trends           │
    │                   │                   │
    │  Search &         │  Webhooks         │
    │  Filter           │                   │
    │                   │                   │
LOW ├───────────────────┼───────────────────┤ HIGH
EFFORT                  │                   EFFORT
    │                   │                   │
    │  Sound            │  File             │
    │  Alerts           │  Browser          │
    │                   │                   │
    │  Export           │  Menu Bar         │
    │  Logs             │  App              │
    │                   │                   │
    └───────────────────┼───────────────────┘
                        │
                    LOW VALUE
```

---

## Recommended Implementation Order

### Sprint 1: Quick Wins
1. Keyboard shortcuts
2. Search functionality
3. Sound alerts

### Sprint 2: Filtering & Export
1. Filter controls
2. Export logs
3. Shortcuts help modal

### Sprint 3: Analytics Foundation
1. SQLite metrics storage
2. Historical data collection
3. Basic trend charts

### Sprint 4: Automation
1. Auto-fix rules
2. Webhooks
3. Sync pause/resume

### Sprint 5: Advanced (Future)
1. Size breakdown visualization
2. File browser
3. Menu bar app
4. API documentation

---

## Success Metrics

| Feature | Success Criteria |
|---------|------------------|
| Search | < 100ms filter response |
| Keyboard shortcuts | All common actions accessible |
| Historical trends | 7 days data retention |
| Webhooks | < 5s delivery time |
| Auto-fix | Reduce manual interventions by 50% |
| File browser | Handle 10,000+ files |
| Menu bar | < 50MB memory footprint |

---

## Technical Debt & Improvements

- [ ] Add unit tests for collectors
- [ ] Add integration tests for API endpoints
- [ ] Implement proper error boundaries in JS
- [ ] Add request rate limiting
- [ ] Improve brctl timeout handling
- [ ] Add configuration file support
- [ ] Implement proper logging rotation
- [ ] Add health check for dependencies

---

## Appendix: File Changes by Feature

| Feature | Files Modified |
|---------|----------------|
| Search & Filter | app.js, index.html, styles.css |
| Keyboard Shortcuts | app.js, index.html (help modal) |
| Historical Trends | server.py, new: metrics_db.py, app.js, index.html |
| Webhooks | server.py, new: webhooks.py, config files |
| Auto-fix Rules | app.js, server.py, new: rules.py |
| File Browser | new: browser.py, app.js, index.html, styles.css |
| Menu Bar App | new: menubar/ directory (separate project) |
