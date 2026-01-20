"""Subprocess wrapper for brctl commands.

All commands have timeouts to prevent blocking.
Actions require explicit user triggering.
"""

import subprocess
import logging
import re
from typing import Optional
from datetime import datetime

from ..config import BRCTL_TIMEOUT

logger = logging.getLogger(__name__)


class BrctlRunner:
    """Safe wrapper for brctl commands with timeouts."""

    def __init__(self, timeout: float = BRCTL_TIMEOUT):
        self.timeout = timeout

    def _run(self, args: list[str], timeout: Optional[float] = None) -> Optional[str]:
        """Run brctl command with timeout.

        Returns stdout on success, None on failure/timeout.
        """
        timeout = timeout or self.timeout
        try:
            result = subprocess.run(
                ["brctl"] + args,
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            if result.returncode == 0:
                return result.stdout
            logger.warning(f"brctl {args[0]} failed: {result.stderr}")
            return None
        except subprocess.TimeoutExpired:
            logger.warning(f"brctl {args[0]} timed out after {timeout}s")
            return None
        except FileNotFoundError:
            logger.error("brctl not found - is this macOS?")
            return None
        except Exception as e:
            logger.error(f"brctl {args[0]} error: {e}")
            return None

    def get_quota(self) -> Optional[dict]:
        """Get iCloud storage quota.

        Returns dict with remaining_bytes and remaining_human.
        """
        output = self._run(["quota"], timeout=10.0)
        if not output:
            return None

        # Parse output like "17986550191 bytes of quota remaining in personal account"
        match = re.search(r"(\d+)\s*bytes?\s*(?:of\s+quota\s+)?remaining", output, re.IGNORECASE)
        if match:
            remaining = int(match.group(1))
            return {
                "remaining_bytes": remaining,
                "remaining_human": self._format_bytes(remaining),
            }
        return None

    def get_status(self) -> Optional[str]:
        """Get container sync status (raw output).

        Returns raw brctl status output for parsing.
        """
        return self._run(["status"], timeout=15.0)

    def get_accounts(self) -> Optional[str]:
        """Get iCloud accounts info."""
        return self._run(["accounts", "-w"], timeout=5.0)

    def get_log(self, last_seconds: int = 30) -> Optional[str]:
        """Get recent CloudDocs log entries."""
        return self._run(["log", "-b", "--last", f"{last_seconds}s"], timeout=10.0)

    def force_download(self, path: str) -> tuple[bool, str]:
        """Force download a specific file.

        USER ACTION: Must be explicitly triggered.
        Returns (success, message).
        """
        logger.info(f"Force download requested: {path}")
        result = subprocess.run(
            ["brctl", "download", path],
            capture_output=True,
            text=True,
            timeout=30.0,
        )
        if result.returncode == 0:
            return True, f"Download initiated for {path}"
        return False, result.stderr or "Download failed"

    def evict_file(self, path: str) -> tuple[bool, str]:
        """Evict local copy of a file.

        USER ACTION: Must be explicitly triggered.
        Returns (success, message).
        """
        logger.info(f"Evict requested: {path}")
        result = subprocess.run(
            ["brctl", "evict", path],
            capture_output=True,
            text=True,
            timeout=30.0,
        )
        if result.returncode == 0:
            return True, f"Evicted {path}"
        return False, result.stderr or "Evict failed"

    def restart_bird(self) -> tuple[bool, str]:
        """Restart the bird daemon.

        USER ACTION: Must be explicitly triggered with confirmation.
        This will temporarily interrupt sync.
        Returns (success, message).
        """
        logger.warning("Bird daemon restart requested")
        try:
            # Send TERM signal to bird
            result = subprocess.run(
                ["launchctl", "kill", "TERM", "system/com.apple.bird"],
                capture_output=True,
                text=True,
                timeout=10.0,
            )
            if result.returncode == 0:
                return True, "Bird daemon restart signal sent. Sync will resume automatically."
            # Fallback: try gui domain
            result = subprocess.run(
                ["launchctl", "kill", "TERM", f"gui/{subprocess.getoutput('id -u')}/com.apple.bird"],
                capture_output=True,
                text=True,
                timeout=10.0,
            )
            if result.returncode == 0:
                return True, "Bird daemon restart signal sent. Sync will resume automatically."
            return False, result.stderr or "Could not restart bird daemon"
        except Exception as e:
            return False, str(e)

    def parse_container_status(self, raw_output: str) -> list[dict]:
        """Parse brctl status output into structured data."""
        if not raw_output:
            return []

        containers = []
        current_container = None

        for line in raw_output.split("\n"):
            # Container line starts with <
            if line.startswith("<"):
                # Parse container ID and state
                match = re.match(r"<([^>]+)>\s+\[([^\]]+)\]\s*\{([^}]+)\}", line)
                if match:
                    container_id = match.group(1)
                    mode = match.group(2).strip()
                    state_str = match.group(3)

                    # Parse state components
                    state = {}
                    for part in state_str.split():
                        if ":" in part:
                            key, value = part.split(":", 1)
                            state[key] = value

                    current_container = {
                        "id": container_id,
                        "mode": mode,
                        "client_state": state.get("client", "unknown"),
                        "server_state": state.get("server", "unknown"),
                        "last_sync": state.get("last-sync", "never"),
                        "needs_sync": "needs-sync" in state_str,
                        "blocked": "blocked" in state_str,
                    }
                    containers.append(current_container)

        return containers

    @staticmethod
    def _format_bytes(bytes_val: int) -> str:
        """Format bytes as human-readable string."""
        for unit in ["B", "KB", "MB", "GB", "TB"]:
            if bytes_val < 1024:
                return f"{bytes_val:.1f} {unit}"
            bytes_val /= 1024
        return f"{bytes_val:.1f} PB"
