"""Read-only SQLite access to CloudDocs database.

CRITICAL: This module MUST be read-only to never interfere with iCloud sync.
Uses URI mode with ?mode=ro to guarantee read-only access.
"""

import sqlite3
import logging
from pathlib import Path
from typing import Optional
from contextlib import contextmanager
from datetime import datetime

from ..config import (
    CLOUDDOCS_DB,
    SQLITE_TIMEOUT,
    SQLITE_BUSY_TIMEOUT,
    MAX_DOWNLOADS,
    MAX_UPLOADS,
    MAX_ERRORS,
)

logger = logging.getLogger(__name__)


class SQLiteReader:
    """Read-only SQLite reader for CloudDocs database."""

    def __init__(self, db_path: Optional[Path] = None):
        self.db_path = db_path or CLOUDDOCS_DB

    @contextmanager
    def _get_connection(self):
        """Get a read-only SQLite connection.

        Uses URI mode with ?mode=ro to guarantee read-only access.
        Sets busy_timeout low to give up quickly if database is locked.
        """
        if not self.db_path.exists():
            raise FileNotFoundError(f"CloudDocs database not found: {self.db_path}")

        uri = f"file:{self.db_path}?mode=ro"
        conn = None
        try:
            conn = sqlite3.connect(
                uri,
                uri=True,
                timeout=SQLITE_TIMEOUT,
                check_same_thread=False,
            )
            conn.row_factory = sqlite3.Row
            # Give up quickly if locked - bird daemon has priority
            conn.execute(f"PRAGMA busy_timeout = {SQLITE_BUSY_TIMEOUT}")
            yield conn
        except sqlite3.OperationalError as e:
            logger.warning(f"Database busy or locked: {e}")
            raise
        finally:
            if conn:
                conn.close()

    def get_download_counts(self) -> dict:
        """Get counts of downloads by throttle state."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT throttle_state, COUNT(*) as count
                    FROM client_downloads
                    GROUP BY throttle_state
                """)
                counts = {row["throttle_state"]: row["count"] for row in cursor}
                return {
                    "active": counts.get(1, 0),
                    "idle": counts.get(0, 0),
                    "total": sum(counts.values()),
                }
        except sqlite3.OperationalError:
            return {"active": None, "idle": None, "total": None, "error": "Database busy"}

    def get_upload_counts(self) -> dict:
        """Get counts of uploads by throttle state."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT throttle_state, COUNT(*) as count
                    FROM client_sync_up
                    GROUP BY throttle_state
                """)
                counts = {row["throttle_state"]: row["count"] for row in cursor}
                # Non-zero throttle_state means active
                active = sum(c for s, c in counts.items() if s != 0)
                return {
                    "active": active,
                    "idle": counts.get(0, 0),
                    "total": sum(counts.values()),
                }
        except sqlite3.OperationalError:
            return {"active": None, "idle": None, "total": None, "error": "Database busy"}

    def get_active_downloads(self) -> list[dict]:
        """Get list of active downloads with file info."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT
                        cd.throttle_id,
                        cd.download_kind,
                        cd.transfer_size,
                        cd.download_priority,
                        cd.throttle_state,
                        ci.item_filename,
                        ci.version_size
                    FROM client_downloads cd
                    LEFT JOIN client_items ci ON cd.throttle_id = ci.rowid
                    WHERE cd.throttle_state = 1
                    ORDER BY cd.download_priority DESC
                    LIMIT ?
                """, (MAX_DOWNLOADS,))

                return [
                    {
                        "id": row["throttle_id"],
                        "filename": row["item_filename"] or "Unknown",
                        "kind": row["download_kind"],
                        "size": row["transfer_size"] or row["version_size"],
                        "priority": row["download_priority"],
                        "state": "downloading",
                    }
                    for row in cursor
                ]
        except sqlite3.OperationalError:
            return []

    def get_active_uploads(self) -> list[dict]:
        """Get list of active uploads with file info."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT
                        csu.throttle_id,
                        csu.throttle_state,
                        csu.in_flight_diffs,
                        ci.item_filename,
                        ci.version_size
                    FROM client_sync_up csu
                    LEFT JOIN client_items ci ON csu.throttle_id = ci.rowid
                    WHERE csu.throttle_state != 0
                    LIMIT ?
                """, (MAX_UPLOADS,))

                return [
                    {
                        "id": row["throttle_id"],
                        "filename": row["item_filename"] or "Unknown",
                        "size": row["version_size"],
                        "state": "uploading",
                    }
                    for row in cursor
                ]
        except sqlite3.OperationalError:
            return []

    def get_recent_errors(self) -> list[dict]:
        """Get recent sync errors."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT
                        error_domain,
                        error_code,
                        error_message,
                        error_timestamp,
                        underlying_error_domain,
                        underlying_error_code
                    FROM item_errors
                    ORDER BY error_timestamp DESC
                    LIMIT ?
                """, (MAX_ERRORS,))

                return [
                    {
                        "domain": row["error_domain"],
                        "code": row["error_code"],
                        "message": row["error_message"],
                        "timestamp": row["error_timestamp"],
                        "underlying_domain": row["underlying_error_domain"],
                        "underlying_code": row["underlying_error_code"],
                    }
                    for row in cursor
                ]
        except sqlite3.OperationalError:
            return []

    def get_error_count(self) -> int:
        """Get count of errors in last 24 hours."""
        try:
            with self._get_connection() as conn:
                cursor = conn.execute("""
                    SELECT COUNT(*) as count
                    FROM item_errors
                    WHERE error_timestamp > datetime('now', '-1 day')
                """)
                row = cursor.fetchone()
                return row["count"] if row else 0
        except sqlite3.OperationalError:
            return -1  # Indicate error

    def get_summary(self) -> dict:
        """Get overall sync summary for dashboard."""
        downloads = self.get_download_counts()
        uploads = self.get_upload_counts()
        error_count = self.get_error_count()

        # Determine overall status
        if downloads.get("error") or uploads.get("error"):
            status = "busy"  # Database is locked, sync in progress
        elif error_count > 0:
            status = "error"
        elif (downloads.get("active", 0) or 0) > 0 or (uploads.get("active", 0) or 0) > 0:
            status = "syncing"
        else:
            status = "idle"

        return {
            "status": status,
            "downloads": downloads,
            "uploads": uploads,
            "errors": {
                "count": error_count if error_count >= 0 else None,
                "error": "Database busy" if error_count < 0 else None,
            },
            "timestamp": datetime.now().isoformat(),
        }
