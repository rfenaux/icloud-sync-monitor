#!/usr/bin/env python3
"""Auto-fix rules engine for iCloud Sync Monitor.

Evaluates rules against stuck files and executes configured actions automatically.
Supports cooldowns, retry limits, and logging.

Created: 2026-01-20 | Sprint 4
"""

import json
import logging
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Optional
from dataclasses import dataclass, field, asdict
from enum import Enum
import uuid

logger = logging.getLogger("icloud-monitor.rules")


class RuleAction(str, Enum):
    """Available rule actions."""
    RETRY_DOWNLOAD = "retry_download"
    EVICT_AND_RETRY = "evict_and_retry"
    NOTIFY = "notify"
    IGNORE = "ignore"


@dataclass
class RuleConditions:
    """Conditions for rule matching."""
    stuck_minutes: int = 30  # Minimum minutes file must be stuck
    file_types: list[str] = field(default_factory=list)  # e.g., [".pdf", ".docx"]
    containers: list[str] = field(default_factory=list)  # e.g., ["iCloud Drive"]
    min_size_bytes: int = 0  # Minimum file size
    max_size_bytes: int = 0  # Maximum file size (0 = no limit)

    def to_dict(self) -> dict:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict) -> "RuleConditions":
        return cls(**{k: v for k, v in data.items() if k in cls.__dataclass_fields__})


@dataclass
class Rule:
    """Auto-fix rule definition."""
    id: str
    name: str
    enabled: bool
    conditions: RuleConditions
    action: RuleAction
    cooldown_minutes: int = 60  # Minimum time between executions for same file
    max_retries: int = 3  # Maximum attempts before giving up on a file
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    updated_at: str = field(default_factory=lambda: datetime.now().isoformat())

    def to_dict(self) -> dict:
        d = asdict(self)
        d["conditions"] = self.conditions.to_dict()
        d["action"] = self.action.value
        return d

    @classmethod
    def from_dict(cls, data: dict) -> "Rule":
        conditions = RuleConditions.from_dict(data.get("conditions", {}))
        action = RuleAction(data.get("action", "notify"))
        return cls(
            id=data.get("id", str(uuid.uuid4())[:8]),
            name=data.get("name", "Unnamed Rule"),
            enabled=data.get("enabled", True),
            conditions=conditions,
            action=action,
            cooldown_minutes=data.get("cooldown_minutes", 60),
            max_retries=data.get("max_retries", 3),
            created_at=data.get("created_at", datetime.now().isoformat()),
            updated_at=data.get("updated_at", datetime.now().isoformat()),
        )


@dataclass
class ExecutionLog:
    """Record of rule execution."""
    timestamp: str
    rule_id: str
    rule_name: str
    file_path: str
    action: str
    success: bool
    message: str
    attempt: int

    def to_dict(self) -> dict:
        return asdict(self)


class RulesEngine:
    """Engine for evaluating and executing auto-fix rules."""

    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.rules_file = config_dir / "rules.json"
        self.log_file = config_dir / "rules_log.json"
        self.rules: list[Rule] = []
        self.execution_log: list[ExecutionLog] = []
        self.cooldowns: dict[str, dict[str, datetime]] = {}  # {file_path: {rule_id: last_execution}}
        self.attempts: dict[str, dict[str, int]] = {}  # {file_path: {rule_id: attempt_count}}
        self.action_handlers: dict[RuleAction, Callable] = {}

        # Load persisted state
        self._load_rules()
        self._load_log()

    def register_action_handler(self, action: RuleAction, handler: Callable[[str], tuple[bool, str]]):
        """Register a handler function for an action type.

        Handler receives file_path and returns (success, message).
        """
        self.action_handlers[action] = handler

    def _load_rules(self):
        """Load rules from config file."""
        if self.rules_file.exists():
            try:
                with open(self.rules_file) as f:
                    data = json.load(f)
                self.rules = [Rule.from_dict(r) for r in data.get("rules", [])]
                logger.info(f"Loaded {len(self.rules)} rules")
            except Exception as e:
                logger.error(f"Failed to load rules: {e}")
                self.rules = []
        else:
            # Create default rules
            self._create_default_rules()

    def _create_default_rules(self):
        """Create sensible default rules."""
        self.rules = [
            Rule(
                id="default-stuck",
                name="Retry Stuck Downloads",
                enabled=True,
                conditions=RuleConditions(stuck_minutes=30),
                action=RuleAction.RETRY_DOWNLOAD,
                cooldown_minutes=60,
                max_retries=3,
            ),
            Rule(
                id="default-large",
                name="Retry Large Files",
                enabled=False,
                conditions=RuleConditions(
                    stuck_minutes=60,
                    min_size_bytes=100 * 1024 * 1024,  # 100MB
                ),
                action=RuleAction.EVICT_AND_RETRY,
                cooldown_minutes=120,
                max_retries=2,
            ),
        ]
        self._save_rules()

    def _save_rules(self):
        """Persist rules to config file."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        with open(self.rules_file, "w") as f:
            json.dump({"rules": [r.to_dict() for r in self.rules]}, f, indent=2)

    def _load_log(self):
        """Load execution log from file."""
        if self.log_file.exists():
            try:
                with open(self.log_file) as f:
                    data = json.load(f)
                # Keep only last 500 entries
                self.execution_log = [
                    ExecutionLog(**e) for e in data.get("log", [])[-500:]
                ]
            except Exception as e:
                logger.error(f"Failed to load execution log: {e}")
                self.execution_log = []

    def _save_log(self):
        """Persist execution log to file."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        with open(self.log_file, "w") as f:
            json.dump({"log": [e.to_dict() for e in self.execution_log[-500:]]}, f, indent=2)

    def _log_execution(self, log: ExecutionLog):
        """Add execution to log and persist."""
        self.execution_log.append(log)
        # Persist every 10 executions
        if len(self.execution_log) % 10 == 0:
            self._save_log()

    def get_rules(self) -> list[dict]:
        """Get all rules as dicts."""
        return [r.to_dict() for r in self.rules]

    def get_rule(self, rule_id: str) -> Optional[dict]:
        """Get a specific rule by ID."""
        for rule in self.rules:
            if rule.id == rule_id:
                return rule.to_dict()
        return None

    def create_rule(self, data: dict) -> dict:
        """Create a new rule."""
        rule_id = data.get("id", str(uuid.uuid4())[:8])
        # Ensure unique ID
        while any(r.id == rule_id for r in self.rules):
            rule_id = str(uuid.uuid4())[:8]
        data["id"] = rule_id
        data["created_at"] = datetime.now().isoformat()
        data["updated_at"] = datetime.now().isoformat()

        rule = Rule.from_dict(data)
        self.rules.append(rule)
        self._save_rules()
        logger.info(f"Created rule: {rule.name} ({rule.id})")
        return rule.to_dict()

    def update_rule(self, rule_id: str, data: dict) -> Optional[dict]:
        """Update an existing rule."""
        for i, rule in enumerate(self.rules):
            if rule.id == rule_id:
                data["id"] = rule_id
                data["created_at"] = rule.created_at
                data["updated_at"] = datetime.now().isoformat()
                self.rules[i] = Rule.from_dict(data)
                self._save_rules()
                logger.info(f"Updated rule: {rule_id}")
                return self.rules[i].to_dict()
        return None

    def delete_rule(self, rule_id: str) -> bool:
        """Delete a rule by ID."""
        for i, rule in enumerate(self.rules):
            if rule.id == rule_id:
                del self.rules[i]
                self._save_rules()
                logger.info(f"Deleted rule: {rule_id}")
                return True
        return False

    def toggle_rule(self, rule_id: str) -> Optional[dict]:
        """Toggle a rule's enabled state."""
        for rule in self.rules:
            if rule.id == rule_id:
                rule.enabled = not rule.enabled
                rule.updated_at = datetime.now().isoformat()
                self._save_rules()
                return rule.to_dict()
        return None

    def get_log(self, limit: int = 100) -> list[dict]:
        """Get recent execution log entries."""
        return [e.to_dict() for e in self.execution_log[-limit:]][::-1]

    def _matches_conditions(self, file: dict, conditions: RuleConditions) -> bool:
        """Check if a file matches rule conditions."""
        # Check stuck duration
        stuck_since = file.get("stuck_since") or file.get("started_at")
        if stuck_since:
            try:
                if isinstance(stuck_since, str):
                    stuck_time = datetime.fromisoformat(stuck_since.replace("Z", "+00:00"))
                else:
                    stuck_time = stuck_since
                stuck_minutes = (datetime.now() - stuck_time.replace(tzinfo=None)).total_seconds() / 60
                if stuck_minutes < conditions.stuck_minutes:
                    return False
            except Exception:
                return False
        else:
            return False

        # Check file types
        if conditions.file_types:
            file_path = file.get("path", "")
            ext = Path(file_path).suffix.lower()
            if ext not in conditions.file_types:
                return False

        # Check containers
        if conditions.containers:
            container = file.get("container", "")
            if not any(c.lower() in container.lower() for c in conditions.containers):
                return False

        # Check file size
        size = file.get("size_bytes", 0) or 0
        if conditions.min_size_bytes and size < conditions.min_size_bytes:
            return False
        if conditions.max_size_bytes and size > conditions.max_size_bytes:
            return False

        return True

    def _is_in_cooldown(self, file_path: str, rule: Rule) -> bool:
        """Check if file is in cooldown for this rule."""
        if file_path not in self.cooldowns:
            return False
        if rule.id not in self.cooldowns[file_path]:
            return False

        last_exec = self.cooldowns[file_path][rule.id]
        cooldown_end = last_exec + timedelta(minutes=rule.cooldown_minutes)
        return datetime.now() < cooldown_end

    def _get_attempts(self, file_path: str, rule_id: str) -> int:
        """Get number of attempts for a file+rule combination."""
        return self.attempts.get(file_path, {}).get(rule_id, 0)

    def _record_attempt(self, file_path: str, rule: Rule):
        """Record an execution attempt."""
        if file_path not in self.attempts:
            self.attempts[file_path] = {}
        if rule.id not in self.attempts[file_path]:
            self.attempts[file_path][rule.id] = 0
        self.attempts[file_path][rule.id] += 1

        if file_path not in self.cooldowns:
            self.cooldowns[file_path] = {}
        self.cooldowns[file_path][rule.id] = datetime.now()

    def _execute_action(self, file: dict, rule: Rule) -> tuple[bool, str]:
        """Execute a rule's action on a file."""
        file_path = file.get("path", "")

        if rule.action not in self.action_handlers:
            return False, f"No handler for action: {rule.action}"

        try:
            handler = self.action_handlers[rule.action]
            return handler(file_path)
        except Exception as e:
            return False, f"Action failed: {str(e)}"

    def evaluate(self, stuck_files: list[dict]) -> list[dict]:
        """Evaluate rules against stuck files and execute matching actions.

        Returns list of execution results.
        """
        results = []

        for file in stuck_files:
            file_path = file.get("path", "")

            for rule in self.rules:
                if not rule.enabled:
                    continue

                # Check conditions
                if not self._matches_conditions(file, rule.conditions):
                    continue

                # Check cooldown
                if self._is_in_cooldown(file_path, rule):
                    continue

                # Check retry limit
                attempts = self._get_attempts(file_path, rule.id)
                if attempts >= rule.max_retries:
                    continue

                # Execute action
                logger.info(f"Executing rule '{rule.name}' on {file_path}")
                success, message = self._execute_action(file, rule)

                # Record attempt and log
                self._record_attempt(file_path, rule)
                log_entry = ExecutionLog(
                    timestamp=datetime.now().isoformat(),
                    rule_id=rule.id,
                    rule_name=rule.name,
                    file_path=file_path,
                    action=rule.action.value,
                    success=success,
                    message=message,
                    attempt=attempts + 1,
                )
                self._log_execution(log_entry)

                results.append({
                    "rule": rule.name,
                    "file": file_path,
                    "action": rule.action.value,
                    "success": success,
                    "message": message,
                    "attempt": attempts + 1,
                })

                # Stop processing more rules for this file once one matches
                break

        # Persist log after evaluation
        self._save_log()
        return results

    def run_rule_manually(self, rule_id: str, file_path: str) -> dict:
        """Manually trigger a rule on a specific file."""
        rule = next((r for r in self.rules if r.id == rule_id), None)
        if not rule:
            return {"success": False, "message": "Rule not found"}

        if rule.action not in self.action_handlers:
            return {"success": False, "message": f"No handler for action: {rule.action}"}

        logger.info(f"Manual trigger: rule '{rule.name}' on {file_path}")
        success, message = self.action_handlers[rule.action](file_path)

        attempts = self._get_attempts(file_path, rule.id)
        log_entry = ExecutionLog(
            timestamp=datetime.now().isoformat(),
            rule_id=rule.id,
            rule_name=rule.name,
            file_path=file_path,
            action=rule.action.value,
            success=success,
            message=message,
            attempt=attempts + 1,
        )
        self._log_execution(log_entry)
        self._save_log()

        return {
            "success": success,
            "message": message,
            "rule": rule.name,
            "action": rule.action.value,
        }

    def clear_file_state(self, file_path: str):
        """Clear cooldowns and attempts for a file (e.g., when it completes sync)."""
        if file_path in self.cooldowns:
            del self.cooldowns[file_path]
        if file_path in self.attempts:
            del self.attempts[file_path]

    def get_stats(self) -> dict:
        """Get rules engine statistics."""
        enabled_rules = sum(1 for r in self.rules if r.enabled)
        recent_executions = [
            e for e in self.execution_log
            if datetime.fromisoformat(e.timestamp) > datetime.now() - timedelta(hours=24)
        ]
        success_count = sum(1 for e in recent_executions if e.success)

        return {
            "total_rules": len(self.rules),
            "enabled_rules": enabled_rules,
            "executions_24h": len(recent_executions),
            "success_rate_24h": round(success_count / len(recent_executions) * 100, 1) if recent_executions else 0,
            "files_in_cooldown": len(self.cooldowns),
        }
