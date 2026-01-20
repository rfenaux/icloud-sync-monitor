# PRD: Live Experience Enhancements

> Created: 2026-01-20 | Version: 1.0

## Objective

Transform the dashboard from a static status page into a dynamic, real-time monitoring experience that feels alive and responsive.

---

## Features

### 1. Visual Polish (CSS)

#### 1.1 Pulse Animation on Status Cards
- Cards pulse gently when sync is active
- Green pulse for healthy sync, orange for warnings
- Stops pulsing when idle

#### 1.2 Spinning Sync Icon
- Header icon spins when actively syncing
- Static cloud when idle

#### 1.3 Smooth List Transitions
- New transfers slide in from top
- Completed transfers fade out
- No jarring reflows

### 2. Animated Counters (JS)

#### 2.1 Number Animation
- Counts smoothly animate up/down
- Duration: 500ms ease-out
- Works for downloads, uploads, errors

#### 2.2 Live Timestamp
- "Updated 2s ago" that ticks every second
- Shows "Just now" for < 5s
- Format: "Xs ago", "Xm ago", "Xh ago"

### 3. Transfer Progress (Backend + Frontend)

#### 3.1 Individual Progress Bars
- Show % complete for active transfers
- Animate progress bar fill
- Show "Queued" vs "Active" state

#### 3.2 Overall Progress
- Aggregate progress bar in header
- "45% complete (234 of 520 files)"

### 4. Speed Indicator

#### 4.1 Throughput Display
- Calculate bytes transferred per interval
- Show "↓ 1.2 MB/s ↑ 856 KB/s"
- Update every 5 seconds

### 5. Activity Feed

#### 5.1 Recent Activity Log
- Scrolling list of completed transfers
- "✓ document.pdf uploaded 3s ago"
- Max 20 items, auto-scroll

### 6. File Type Icons

#### 6.1 Visual File Icons
- PDF, image, video, audio, document, code, archive, other
- SVG icons inline (no external dependencies)
- Based on file extension

### 7. Browser Integration

#### 7.1 Favicon Badge
- Show active transfer count on favicon
- Red badge for errors
- Uses canvas to draw dynamic favicon

#### 7.2 Desktop Notifications
- Request permission on first visit
- Notify on: new errors, sync complete, stuck sync
- Configurable on/off

### 8. Sparkline Charts

#### 8.1 Activity Sparklines
- Mini line charts in status cards
- Show last 60 data points (5 min at 5s interval)
- Lightweight canvas-based

---

## Technical Implementation

### CSS Additions

```css
/* Pulse animation */
@keyframes pulse-sync {
  0%, 100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.4); }
  50% { box-shadow: 0 0 0 10px rgba(74, 222, 128, 0); }
}

/* Spinning icon */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

/* Counter animation handled via JS */
/* List transitions via CSS transitions */
```

### JavaScript Additions

```javascript
// Animated counter
function animateValue(element, start, end, duration) { ... }

// Live timestamp
function updateRelativeTime() { ... }

// Sparkline
function drawSparkline(canvas, data) { ... }

// Favicon badge
function updateFaviconBadge(count, hasError) { ... }
```

### Backend Changes

- Track transfer speeds (bytes delta / time delta)
- Store recent activity for feed
- No new dependencies required

---

## File Changes

| File | Changes |
|------|---------|
| `static/styles.css` | Animations, transitions, sparkline styles |
| `static/app.js` | Counter animation, timestamps, sparklines, favicon |
| `static/index.html` | Activity feed section, sparkline canvases |
| `src/server.py` | Speed calculation, activity tracking |

---

## Success Criteria

- [ ] Status cards pulse when syncing
- [ ] Numbers animate smoothly
- [ ] "Updated Xs ago" ticks live
- [ ] Transfer list has smooth transitions
- [ ] Speed indicator shows throughput
- [ ] Activity feed shows recent completions
- [ ] File icons display correctly
- [ ] Favicon shows badge count
- [ ] Sparklines render activity history
