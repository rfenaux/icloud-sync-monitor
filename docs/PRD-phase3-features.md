# PRD: Phase 3 Features

> Created: 2026-01-20 | Version: 1.0

## Objective

Add intelligent monitoring capabilities and improved UX with stuck file detection, dark mode support, and per-container sync visibility.

---

## Features

### 1. Stuck File Detection

#### 1.1 Detection Logic
- Track when each file entered the queue (first seen timestamp)
- Flag files stuck > 10 minutes as "potentially stuck"
- Flag files stuck > 30 minutes as "stuck"
- Persist tracking across page refreshes (localStorage)

#### 1.2 Visual Alert
- Prominent banner when stuck files detected
- "⚠️ 3 files appear stuck (oldest: 45 min)"
- Pulsing orange/red animation
- Click to expand and see stuck files list

#### 1.3 Quick Actions
- "Fix All" button attempts force download on all stuck files
- Individual "Retry" button per stuck file
- "Dismiss" to ignore a file for 1 hour

#### 1.4 Sync Health Score
- 0-100 score displayed in header
- Formula: 100 - (errors × 5) - (stuck × 10) - (queue_depth × 0.1)
- Color coded: Green (80+), Yellow (50-79), Red (<50)

### 2. Dark Mode

#### 2.1 Theme Toggle
- Toggle button in header (☀️/🌙)
- Respects system preference by default (prefers-color-scheme)
- User choice persisted in localStorage

#### 2.2 CSS Variables
- All colors defined as CSS custom properties
- Single class toggle on `<body>` switches theme
- Smooth transition on theme change (200ms)

#### 2.3 Color Palette
| Element | Light | Dark |
|---------|-------|------|
| Background | #f5f5f5 | #1a1a2e |
| Card BG | #ffffff | #16213e |
| Text | #1f2937 | #e5e5e5 |
| Text Secondary | #6b7280 | #9ca3af |
| Border | #e5e7eb | #374151 |
| Accent Blue | #4da8da | #5eead4 |
| Accent Green | #4ade80 | #4ade80 |
| Accent Orange | #fb923c | #fbbf24 |
| Accent Red | #f87171 | #f87171 |

### 3. Container Breakdown

#### 3.1 Data Source
- Parse `brctl status` output for container list
- Extract: container name, item count, sync state
- Map container IDs to friendly names

#### 3.2 Container Cards
- Collapsible section showing all iCloud containers
- Per-container: name, icon, sync status, item count
- Visual indicator: syncing/idle/error

#### 3.3 Container Mapping
| Container ID Pattern | Display Name | Icon |
|---------------------|--------------|------|
| com.apple.CloudDocs | iCloud Drive | 📁 |
| com.apple.Photos | Photos | 📷 |
| com.apple.Notes | Notes | 📝 |
| com.apple.Reminders | Reminders | ✓ |
| com.apple.Safari | Safari | 🧭 |
| com.apple.mail | Mail | ✉️ |
| Third-party apps | App Name | 📱 |

---

## Technical Implementation

### Backend Changes (server.py)

```python
# Add to /api/status response
{
    "stuck_files": [
        {"path": "...", "stuck_since": "ISO8601", "minutes": 45}
    ],
    "health_score": 85,
    "containers": [
        {"id": "com.apple.CloudDocs", "name": "iCloud Drive", "items": 234, "state": "syncing"}
    ]
}
```

### Frontend Changes

```javascript
// Stuck file tracking
const fileFirstSeen = JSON.parse(localStorage.getItem('fileFirstSeen') || '{}');

function checkStuckFiles(transfers) {
    const now = Date.now();
    const stuck = [];
    transfers.forEach(t => {
        if (!fileFirstSeen[t.path]) {
            fileFirstSeen[t.path] = now;
        }
        const age = (now - fileFirstSeen[t.path]) / 60000;
        if (age > 10) stuck.push({...t, minutes: Math.round(age)});
    });
    localStorage.setItem('fileFirstSeen', JSON.stringify(fileFirstSeen));
    return stuck;
}

// Dark mode
function toggleDarkMode() {
    document.body.classList.toggle('dark-mode');
    localStorage.setItem('darkMode', document.body.classList.contains('dark-mode'));
}
```

### CSS Structure

```css
:root {
    --bg-primary: #f5f5f5;
    --bg-card: #ffffff;
    --text-primary: #1f2937;
    /* ... */
}

body.dark-mode {
    --bg-primary: #1a1a2e;
    --bg-card: #16213e;
    --text-primary: #e5e5e5;
    /* ... */
}

* {
    transition: background-color 0.2s, color 0.2s, border-color 0.2s;
}
```

---

## File Changes

| File | Changes |
|------|---------|
| `static/styles.css` | CSS variables, dark mode, stuck alert styles, container cards |
| `static/app.js` | Stuck detection, dark mode toggle, container rendering, health score |
| `static/index.html` | Theme toggle button, stuck alert banner, containers section, health score |
| `src/server.py` | Container parsing in status endpoint |
| `src/collectors/brctl_runner.py` | Enhanced container status parsing |

---

## Success Criteria

- [ ] Stuck files detected after 10 minutes in queue
- [ ] Stuck alert banner visible with count and age
- [ ] "Fix All" successfully triggers downloads
- [ ] Dark mode toggle works and persists
- [ ] System preference respected on first visit
- [ ] Smooth theme transition animation
- [ ] Container list shows all iCloud containers
- [ ] Per-container item counts accurate
- [ ] Health score displays and updates
