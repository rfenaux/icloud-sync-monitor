# PRD: iCloud Sync Monitor - Phase 2

> Created: 2026-01-20 | Version: 1.0

## Current State (v1.0)

The MVP is live with:
- Real-time sync status (downloads/uploads/errors)
- Quota bar (currently showing "Unknown" - bug)
- Active transfers list
- Action buttons (force download, evict, restart bird)
- WebSocket live updates
- LaunchAgent auto-start

### Known Issues to Fix
1. **Quota shows "Unknown"** - Caching issue, not refreshing properly
2. **Filenames show UUIDs** - Need to resolve actual filenames from database
3. **Generic "Documents" entries** - Missing proper file path resolution
4. **No file sizes shown** - Size column shows "--"

---

## Phase 2: Enhanced Visibility

### 2.1 Bug Fixes (P0)

| Issue | Root Cause | Fix |
|-------|------------|-----|
| Quota "Unknown" | Cache not being set on first load | Initialize quota fetch on server start |
| UUID filenames | Querying wrong column | Use `item_filename` with fallback to path parsing |
| Missing sizes | `version_size` can be null | Fallback to `transfer_size` or show "Calculating..." |

### 2.2 Full File Paths (P0)

**Problem:** Users see "Documents" repeatedly, can't identify which files are syncing.

**Solution:**
- Query `item_parent_id` recursively to build full path
- Cache path lookups (parent IDs are stable)
- Show truncated path with tooltip for full path
- Format: `~/Documents/Projects/file.pdf`

**UI Change:**
```
Before: Documents                    -- uploading
After:  ~/Documents/Projects/re...  4.2 MB  uploading
        [hover tooltip: ~/Documents/Projects/reports/Q4-2025.pdf]
```

### 2.3 Progress Indicators (P1)

**Problem:** No visibility into upload/download progress.

**Solution:**
- Parse `brctl status` for progress percentage when available
- Show progress bar inline for active transfers
- Show "Queued" vs "Active" distinction

**Data Source:**
```
> apply{[ active attempts:0 last:never next:ready cleanup:ready]}
downloader{downloading:45%}
```

### 2.4 Container Status View (P1)

**Problem:** Can't see which apps/services are syncing or blocked.

**Solution:**
- New "Containers" tab/section
- Show container ID, app name, sync state
- Highlight blocked containers (app uninstalled)
- Allow filtering transfers by container

**UI Mockup:**
```
CONTAINERS (163)
┌────────────────────────────────────────────────────────────┐
│ ● com.apple.CloudDocs          idle       Last: 2 min ago │
│ ● com.apple.Notes              syncing    12 items        │
│ ○ com.example.app              blocked    App uninstalled │
└────────────────────────────────────────────────────────────┘
```

### 2.5 Search & Filter (P1)

**Problem:** Hard to find specific files in long transfer lists.

**Solution:**
- Search box filters transfers by filename
- Filter buttons: All | Uploads | Downloads | Errors
- Sort options: Name | Size | Status

### 2.6 Sync History Timeline (P2)

**Problem:** No visibility into past sync activity.

**Solution:**
- Store last 24h of sync events in local SQLite
- Timeline view showing completed syncs
- Aggregate stats: "1,234 files synced today"

**Schema:**
```sql
CREATE TABLE sync_history (
    id INTEGER PRIMARY KEY,
    timestamp TEXT,
    event_type TEXT,  -- 'upload_complete', 'download_complete', 'error'
    filename TEXT,
    size_bytes INTEGER,
    duration_ms INTEGER
);
```

### 2.7 Notifications (P2)

**Problem:** User misses errors or stuck syncs.

**Solution:**
- macOS native notifications via `osascript`
- Configurable triggers:
  - New errors (on/off)
  - Sync stuck > 5 minutes (on/off)
  - Quota < 1GB (on/off)
- Settings stored in config file

---

## Phase 3: Menu Bar App (Future)

### 3.1 Native Swift Menu Bar Icon

**Goal:** Quick status visibility without opening browser.

**Features:**
- Status icon changes: ● syncing | ○ idle | ⚠ error
- Badge with active transfer count
- Dropdown shows quick stats
- Click opens web dashboard

**Tech Stack:** Swift + AppKit (not SwiftUI for menu bar stability)

### 3.2 Menu Bar Dropdown

```
┌─────────────────────────────┐
│  iCloud Sync Monitor        │
├─────────────────────────────┤
│  ↓ 3 downloading            │
│  ↑ 112 uploading            │
│  16.1 GB remaining          │
├─────────────────────────────┤
│  Open Dashboard...          │
│  Pause Sync                 │
│  ──────────────────         │
│  Preferences...             │
│  Quit                       │
└─────────────────────────────┘
```

---

## Phase 4: Advanced Features (Future)

| Feature | Description | Priority |
|---------|-------------|----------|
| Bulk actions | Download/evict entire folders | P2 |
| Folder tree view | Hierarchical sync status | P3 |
| Throughput graph | Upload/download speed over time | P3 |
| Export diagnostics | One-click `brctl diagnose` export | P2 |
| Theme toggle | Dark/light mode switch | P3 |
| Keyboard shortcuts | Quick actions via hotkeys | P3 |
| API for automation | REST API for scripts/Shortcuts | P3 |

---

## Implementation Priority

### Immediate (This Week)
1. Fix quota display bug
2. Fix filename resolution
3. Add file sizes to transfers

### Short-term (Next 2 Weeks)
4. Progress indicators
5. Search & filter
6. Container status view

### Medium-term (Month)
7. Sync history timeline
8. Notifications
9. Menu bar app (Phase 3)

---

## Technical Considerations

### Performance
- Path resolution can be expensive (recursive parent lookup)
- Cache aggressively: parent paths rarely change
- Limit history to 24h to avoid database bloat

### Non-Blocking (CRITICAL)
- All new queries must use read-only SQLite mode
- All new subprocess calls need timeouts
- Never hold database connections during renders

### Testing
- Mock SQLite database for unit tests
- Test with large transfer queues (10k+ items)
- Test container parsing with various states

---

## Success Metrics

| Metric | Target |
|--------|--------|
| Filename resolution | 95% of transfers show readable names |
| Quota always visible | No more "Unknown" |
| Page load time | < 500ms |
| WebSocket latency | < 100ms for updates |
| Memory usage | < 50MB resident |

---

## Appendix: Database Schema Reference

### Useful Tables for Phase 2

```sql
-- Full path resolution
SELECT item_filename, item_parent_id FROM client_items WHERE rowid = ?;

-- Container info
SELECT * FROM container_info;  -- If exists

-- Sync state codes
-- item_localsyncupstate: 0=synced, 1=change, 2=uploading, 3=need download, 4=downloading
```

### brctl Output Parsing

```
-- Container status line
<container_id> [foreground|background] {client:state server:state sync:state last-sync:timestamp}

-- Progress indicator
downloader{downloading:45%}
uploading:67%
```
