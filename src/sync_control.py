#!/usr/bin/env python3
"""Sync pause/resume control for iCloud Sync Monitor.

Uses SIGSTOP/SIGCONT to pause/resume the bird daemon (CloudDocs).
This is a soft pause - the process is suspended but maintains connections.

Created: 2026-01-20 | Sprint 4
"""

import json
import logging
import os
import signal
import subprocess
from datetime import datetime, timedelta
from pathlib import Path
from threading import Timer
from typing import Optional

logger = logging.getLogger("icloud-monitor.sync_control")


class SyncController:
    """Controls iCloud sync pause/resume functionality."""

    def __init__(self, config_dir: Path):
        self.config_dir = config_dir
        self.state_file = config_dir / "sync_state.json"
        self.is_paused = False
        self.paused_at: Optional[datetime] = None
        self.resume_at: Optional[datetime] = None
        self.auto_resume_timer: Optional[Timer] = None
        self.bird_pid: Optional[int] = None

        # Load persisted state
        self._load_state()

        # Check if we need to resume from a previous pause
        self._check_auto_resume()

    def _load_state(self):
        """Load persisted pause state."""
        if self.state_file.exists():
            try:
                with open(self.state_file) as f:
                    data = json.load(f)
                self.is_paused = data.get("is_paused", False)
                if data.get("paused_at"):
                    self.paused_at = datetime.fromisoformat(data["paused_at"])
                if data.get("resume_at"):
                    self.resume_at = datetime.fromisoformat(data["resume_at"])
                self.bird_pid = data.get("bird_pid")

                # Verify the pause is still active
                if self.is_paused and self.bird_pid:
                    # Check if the process is actually stopped
                    if not self._is_process_stopped(self.bird_pid):
                        # Process resumed externally, update state
                        self.is_paused = False
                        self.paused_at = None
                        self.resume_at = None
                        self._save_state()
            except Exception as e:
                logger.error(f"Failed to load sync state: {e}")

    def _save_state(self):
        """Persist pause state."""
        self.config_dir.mkdir(parents=True, exist_ok=True)
        data = {
            "is_paused": self.is_paused,
            "paused_at": self.paused_at.isoformat() if self.paused_at else None,
            "resume_at": self.resume_at.isoformat() if self.resume_at else None,
            "bird_pid": self.bird_pid,
            "updated_at": datetime.now().isoformat(),
        }
        with open(self.state_file, "w") as f:
            json.dump(data, f, indent=2)

    def _check_auto_resume(self):
        """Check if we need to auto-resume from a previous scheduled resume."""
        if self.is_paused and self.resume_at:
            now = datetime.now()
            if now >= self.resume_at:
                # Should have resumed already
                logger.info("Auto-resume time passed, resuming sync")
                self.resume()
            else:
                # Schedule the resume
                remaining = (self.resume_at - now).total_seconds()
                self._schedule_auto_resume(remaining)

    def _get_bird_pid(self) -> Optional[int]:
        """Get the PID of the bird daemon."""
        try:
            result = subprocess.run(
                ["pgrep", "-x", "bird"],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                pids = result.stdout.strip().split("\n")
                # Return the first bird process (usually only one)
                return int(pids[0]) if pids else None
        except Exception as e:
            logger.error(f"Failed to get bird PID: {e}")
        return None

    def _is_process_stopped(self, pid: int) -> bool:
        """Check if a process is in stopped (T) state."""
        try:
            result = subprocess.run(
                ["ps", "-o", "state=", "-p", str(pid)],
                capture_output=True,
                text=True,
                timeout=5,
            )
            if result.returncode == 0:
                state = result.stdout.strip()
                return "T" in state  # T = stopped
        except Exception:
            pass
        return False

    def _send_signal(self, pid: int, sig: int) -> tuple[bool, str]:
        """Send a signal to a process."""
        try:
            os.kill(pid, sig)
            return True, "Signal sent successfully"
        except ProcessLookupError:
            return False, "Process not found"
        except PermissionError:
            return False, "Permission denied - cannot signal process"
        except Exception as e:
            return False, f"Failed to send signal: {str(e)}"

    def _schedule_auto_resume(self, seconds: float):
        """Schedule automatic resume after specified seconds."""
        if self.auto_resume_timer:
            self.auto_resume_timer.cancel()

        def do_resume():
            logger.info("Auto-resume timer triggered")
            self.resume()

        self.auto_resume_timer = Timer(seconds, do_resume)
        self.auto_resume_timer.daemon = True
        self.auto_resume_timer.start()
        logger.info(f"Auto-resume scheduled in {seconds:.0f} seconds")

    def get_status(self) -> dict:
        """Get current sync status."""
        # Refresh bird PID
        current_pid = self._get_bird_pid()

        # Check if paused state is still valid
        if self.is_paused and self.bird_pid:
            if current_pid != self.bird_pid:
                # Bird was restarted, pause is no longer valid
                self.is_paused = False
                self.paused_at = None
                self.resume_at = None
                self._save_state()
            elif not self._is_process_stopped(self.bird_pid):
                # Process was resumed externally
                self.is_paused = False
                self.paused_at = None
                self.resume_at = None
                self._save_state()

        status = {
            "is_paused": self.is_paused,
            "bird_pid": current_pid,
            "bird_running": current_pid is not None,
        }

        if self.is_paused:
            status["paused_at"] = self.paused_at.isoformat() if self.paused_at else None
            status["paused_duration_seconds"] = (
                (datetime.now() - self.paused_at).total_seconds()
                if self.paused_at else 0
            )
            if self.resume_at:
                status["resume_at"] = self.resume_at.isoformat()
                remaining = (self.resume_at - datetime.now()).total_seconds()
                status["resume_in_seconds"] = max(0, remaining)

        return status

    def pause(self, duration_minutes: Optional[int] = None) -> dict:
        """Pause iCloud sync.

        Args:
            duration_minutes: Auto-resume after this many minutes (optional)

        Returns:
            Status dict with success flag and message
        """
        if self.is_paused:
            return {
                "success": False,
                "message": "Sync is already paused",
                "status": self.get_status(),
            }

        pid = self._get_bird_pid()
        if not pid:
            return {
                "success": False,
                "message": "Bird daemon not found - iCloud sync may not be running",
            }

        # Send SIGSTOP to pause the process
        success, message = self._send_signal(pid, signal.SIGSTOP)
        if not success:
            return {"success": False, "message": message}

        # Update state
        self.is_paused = True
        self.paused_at = datetime.now()
        self.bird_pid = pid

        # Schedule auto-resume if duration specified
        if duration_minutes:
            self.resume_at = datetime.now() + timedelta(minutes=duration_minutes)
            self._schedule_auto_resume(duration_minutes * 60)
        else:
            self.resume_at = None

        self._save_state()

        logger.info(f"iCloud sync paused (bird PID {pid})")
        return {
            "success": True,
            "message": f"iCloud sync paused{f' for {duration_minutes} minutes' if duration_minutes else ''}",
            "status": self.get_status(),
        }

    def resume(self) -> dict:
        """Resume iCloud sync.

        Returns:
            Status dict with success flag and message
        """
        # Cancel any pending auto-resume
        if self.auto_resume_timer:
            self.auto_resume_timer.cancel()
            self.auto_resume_timer = None

        if not self.is_paused:
            return {
                "success": True,
                "message": "Sync is not paused",
                "status": self.get_status(),
            }

        # Get current PID (may have changed if bird restarted)
        pid = self.bird_pid or self._get_bird_pid()
        if not pid:
            # Bird not running, just clear the pause state
            self.is_paused = False
            self.paused_at = None
            self.resume_at = None
            self._save_state()
            return {
                "success": True,
                "message": "Pause cleared (bird daemon not running)",
                "status": self.get_status(),
            }

        # Send SIGCONT to resume the process
        success, message = self._send_signal(pid, signal.SIGCONT)

        # Update state regardless (if signal failed, process may have been restarted)
        self.is_paused = False
        self.paused_at = None
        self.resume_at = None
        self.bird_pid = None
        self._save_state()

        if success:
            logger.info(f"iCloud sync resumed (bird PID {pid})")
            return {
                "success": True,
                "message": "iCloud sync resumed",
                "status": self.get_status(),
            }
        else:
            logger.warning(f"Resume signal failed: {message}")
            return {
                "success": True,  # State is cleared anyway
                "message": f"Pause cleared ({message})",
                "status": self.get_status(),
            }

    def extend_pause(self, additional_minutes: int) -> dict:
        """Extend the current pause duration.

        Args:
            additional_minutes: Minutes to add to current pause

        Returns:
            Status dict with success flag and message
        """
        if not self.is_paused:
            return {
                "success": False,
                "message": "Sync is not paused",
            }

        # Cancel existing timer
        if self.auto_resume_timer:
            self.auto_resume_timer.cancel()

        # Set new resume time
        self.resume_at = datetime.now() + timedelta(minutes=additional_minutes)
        self._schedule_auto_resume(additional_minutes * 60)
        self._save_state()

        return {
            "success": True,
            "message": f"Pause extended by {additional_minutes} minutes",
            "status": self.get_status(),
        }
