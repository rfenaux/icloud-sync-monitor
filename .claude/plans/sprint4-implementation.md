# Sprint 4 Implementation Plan

> Created: 2026-01-20 | Updated: 2026-01-20 | Status: 2/3 Complete

## Objective

Implement Phase 6 automation features: auto-fix rules, webhooks, and sync pause/resume.

---

## Tasks

### 1. Auto-Fix Rules Engine ✅ COMPLETE
**Files:** `src/rules.py` (new), `src/server.py`, `app.js`, `index.html`, `styles.css`

#### Backend
- [x] Create `RulesEngine` class
- [x] Rule schema: id, enabled, conditions, action, cooldown, max_retries
- [x] Conditions: stuck_minutes, file_types, containers, min/max_size_bytes
- [x] Actions: retry_download, evict_and_retry, notify, ignore
- [x] Persist rules to `config/rules.json`
- [x] Execution log with timestamps
- [x] Cooldown tracking per file

#### API Endpoints
- [x] `GET /api/rules` - List all rules
- [x] `POST /api/rules` - Create rule
- [x] `PUT /api/rules/<id>` - Update rule
- [x] `DELETE /api/rules/<id>` - Delete rule
- [x] `POST /api/rules/<id>/toggle` - Toggle enabled
- [x] `POST /api/rules/<id>/run` - Manual trigger
- [x] `GET /api/rules/log` - Execution history

#### Frontend
- [x] Rules section in UI
- [x] Rule cards with enable/disable toggle
- [x] Add/Edit rule modal
- [x] Execution log display
- [x] Statistics display (24h success rate)

### 2. Webhooks
**Files:** `src/webhooks.py` (new), `src/server.py`, `app.js`, `index.html`, `styles.css`

#### Backend
- [ ] Create `WebhookManager` class
- [ ] Webhook schema: id, name, url, events, enabled, secret
- [ ] Events: sync.started, sync.completed, error.new, stuck.detected, health.critical
- [ ] Retry with exponential backoff (3 attempts)
- [ ] Persist to `config/webhooks.json`
- [ ] Delivery log with status

#### API Endpoints
- [ ] `GET /api/webhooks` - List webhooks
- [ ] `POST /api/webhooks` - Create webhook
- [ ] `PUT /api/webhooks/<id>` - Update webhook
- [ ] `DELETE /api/webhooks/<id>` - Delete webhook
- [ ] `POST /api/webhooks/<id>/test` - Send test payload
- [ ] `GET /api/webhooks/log` - Delivery history

#### Frontend
- [ ] Webhooks section in UI
- [ ] Webhook cards with status indicator
- [ ] Add/Edit webhook modal with event checkboxes
- [ ] Test button with result toast
- [ ] Delivery log display

### 3. Sync Pause/Resume ✅ COMPLETE
**Files:** `src/sync_control.py` (new), `src/server.py`, `app.js`, `index.html`, `styles.css`

#### Backend
- [x] Create `SyncController` class
- [x] Uses `SIGSTOP` / `SIGCONT` on bird daemon
- [x] Auto-resume timer with scheduled execution
- [x] Persist pause state to `config/sync_state.json`
- [x] Process verification (detects if bird restarted)

#### API Endpoints
- [x] `GET /api/sync/status` - Pause state with countdown
- [x] `POST /api/sync/pause` - Pause with optional duration
- [x] `POST /api/sync/resume` - Resume sync
- [x] `POST /api/sync/extend` - Extend pause duration

#### Frontend
- [x] Pause/Resume toggle button in header
- [x] Orange banner when paused with countdown
- [x] Duration selection modal (15min, 30min, 1hr, indefinite)
- [x] Extend pause dropdown in banner
- [x] Real-time countdown display

---

## Implementation Order

1. **Auto-fix rules** (most valuable - reduces manual intervention)
2. **Webhooks** (enables external integrations)
3. **Sync pause/resume** (nice-to-have, may have OS limitations)

---

## Technical Notes

### Rules Engine Architecture
```python
class RulesEngine:
    def __init__(self):
        self.rules = self.load_rules()
        self.execution_log = []
        self.cooldowns = {}  # {file_id: {rule_id: last_execution}}

    def evaluate(self, stuck_files: list):
        for file in stuck_files:
            for rule in self.rules:
                if rule.enabled and self.matches(file, rule):
                    if not self.in_cooldown(file, rule):
                        self.execute(file, rule)

    def matches(self, file, rule) -> bool:
        # Check stuck_minutes, file_types, containers
        pass

    def execute(self, file, rule):
        # Run action, log execution, set cooldown
        pass
```

### Webhook Payload Format
```json
{
    "event": "stuck.detected",
    "timestamp": "2026-01-20T15:30:00Z",
    "data": {
        "files": [...],
        "count": 3,
        "health_score": 65
    }
}
```

### Sync Control Notes
- `brctl status` shows current state but no pause command found
- Alternative: Use `launchctl` to unload/load bird agent
- Risk: May cause sync issues - needs careful testing
- Safest: Just disable network for bird process (requires root)

---

## Success Criteria

- [ ] Rules automatically retry stuck files after configured time
- [ ] Webhooks deliver to Slack/Discord with <5s latency
- [ ] Pause/Resume works without corrupting sync state
- [ ] All configs persist across server restarts
- [ ] UI is intuitive and responsive

---

## File Changes Summary

| Feature | New Files | Modified Files |
|---------|-----------|----------------|
| Auto-fix rules | `src/rules.py`, `config/rules.json` | `server.py`, `app.js`, `index.html`, `styles.css` |
| Webhooks | `src/webhooks.py`, `config/webhooks.json` | `server.py`, `app.js`, `index.html`, `styles.css` |
| Sync control | `src/sync_control.py` | `server.py`, `app.js`, `index.html`, `styles.css` |
