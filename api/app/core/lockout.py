"""In-process brute-force / account lockout tracker.

Uses a thread-safe in-memory store keyed by the normalised credential (email
or username, always lowercased).  A persistent store (Redis, DB) is the right
choice in production; swap `_store` for a Redis client and this interface
stays identical.

Failure window: sliding — each failed attempt resets its own expiry inside the
window so a burst of failures near the window boundary still counts.
"""

import logging
import threading
import time
from dataclasses import dataclass, field

from .config import settings

logger = logging.getLogger("auth.lockout")


@dataclass
class _Entry:
    attempts: list[float] = field(default_factory=list)  # epoch timestamps
    locked_until: float = 0.0


class LockoutStore:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._store: dict[str, _Entry] = {}

    def _entry(self, key: str) -> _Entry:
        if key not in self._store:
            self._store[key] = _Entry()
        return self._store[key]

    def _prune(self, entry: _Entry, now: float) -> None:
        """Remove attempts outside the sliding window."""
        cutoff = now - settings.lockout_window_seconds
        entry.attempts = [t for t in entry.attempts if t > cutoff]

    def is_locked(self, credential: str) -> tuple[bool, float]:
        """Return (locked, seconds_remaining)."""
        key = credential.strip().lower()
        now = time.monotonic()
        with self._lock:
            entry = self._entry(key)
            if entry.locked_until > now:
                return True, entry.locked_until - now
            return False, 0.0

    def record_failure(self, credential: str) -> None:
        key = credential.strip().lower()
        now = time.monotonic()
        with self._lock:
            entry = self._entry(key)
            self._prune(entry, now)
            entry.attempts.append(now)
            count = len(entry.attempts)
            logger.warning(
                "[lockout] failed attempt %d/%d for '%s'",
                count, settings.lockout_max_attempts, key,
            )
            if count >= settings.lockout_max_attempts:
                entry.locked_until = now + settings.lockout_duration_seconds
                logger.warning(
                    "[lockout] account LOCKED for %.0fs: '%s'",
                    settings.lockout_duration_seconds, key,
                )

    def record_success(self, credential: str) -> None:
        key = credential.strip().lower()
        with self._lock:
            self._store.pop(key, None)


lockout = LockoutStore()
