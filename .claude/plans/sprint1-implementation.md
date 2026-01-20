# Sprint 1 Implementation Plan

> Created: 2026-01-20 | Status: In Progress

## Objective

Implement Phase 4 quick wins: keyboard shortcuts, search, filters, and sound alerts.

---

## Tasks

### 1. Keyboard Shortcuts
**Files:** `app.js`, `index.html`, `styles.css`

- [ ] Add global keydown listener
- [ ] Implement shortcuts:
  - `/` or `Cmd+K` → Focus search
  - `Escape` → Clear search / Close dialog
  - `T` → Toggle dark mode
  - `R` → Refresh data
  - `D` → Open download dialog
  - `E` → Open evict dialog
  - `Shift+R` → Restart bird (with confirm)
  - `F` → Fix all stuck (with confirm)
  - `?` → Show shortcuts help modal
- [ ] Create help modal with shortcuts table
- [ ] Add visual hint in UI ("Press ? for shortcuts")

### 2. Search Functionality
**Files:** `app.js`, `index.html`, `styles.css`

- [ ] Add search input to header
- [ ] Implement real-time filtering
- [ ] Search across: filename, path, container
- [ ] Highlight matching text (optional)
- [ ] Show result count
- [ ] Clear button (and Escape key)

### 3. Filter Controls
**Files:** `app.js`, `index.html`, `styles.css`

- [ ] Add filter section below search
- [ ] Filter by type: Downloads / Uploads / All
- [ ] Filter by status: Active / Queued / Stuck
- [ ] Filter by file type: Images, Videos, Documents, etc.
- [ ] Active filter chips with clear option
- [ ] Persist filter state in localStorage

### 4. Sound Alerts
**Files:** `app.js`, `index.html`, `styles.css`

- [ ] Add sound toggle in settings/header
- [ ] Implement sounds:
  - Sync complete → Chime
  - New error → Alert
  - Stuck detected → Warning
- [ ] Use Web Audio API or base64 audio
- [ ] Persist preference in localStorage
- [ ] Respect system mute state

---

## Implementation Order

1. **Keyboard shortcuts** (foundation for other features)
2. **Search** (most requested)
3. **Filters** (builds on search)
4. **Sound alerts** (independent, can be done in parallel)

---

## Technical Notes

### Search Architecture
```javascript
// State
let searchQuery = '';
let activeFilters = { type: 'all', status: 'all', fileType: 'all' };

// Filter pipeline
function getFilteredTransfers() {
    return allTransfers
        .filter(t => matchesSearch(t, searchQuery))
        .filter(t => matchesFilters(t, activeFilters));
}
```

### Sound Implementation
```javascript
// Use short base64-encoded sounds to avoid external dependencies
const SOUNDS = {
    chime: 'data:audio/mp3;base64,...',
    alert: 'data:audio/mp3;base64,...',
};

// Or use Web Audio API for generated tones
function playTone(frequency, duration) {
    const ctx = new AudioContext();
    const osc = ctx.createOscillator();
    osc.frequency.value = frequency;
    osc.connect(ctx.destination);
    osc.start();
    setTimeout(() => osc.stop(), duration);
}
```

---

## Success Criteria

- [ ] All keyboard shortcuts work
- [ ] Help modal shows on `?` press
- [ ] Search filters transfers in real-time
- [ ] Filters combine with search correctly
- [ ] Sound plays on configured events
- [ ] All preferences persist across sessions
- [ ] No performance degradation with 100+ transfers
