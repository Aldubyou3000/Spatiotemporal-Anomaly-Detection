"""Audit logging service — append-only, non-blocking, tamper-resistant.

Design decisions:
- All writes go through a background thread queue so the request path is
  never blocked by a slow DB write.  Fire-and-forget with bounded queue.
- Sensitive fields (credential, user_agent) are truncated / sanitised
  before storage to limit log injection risk.
- The service writes via the service-role key to bypass RLS.  The
  audit_log table has a deny-all RLS policy; no anon/authed role can
  read or write directly.
- A per-event SHA-256 chain hash (each entry hashes its own content +
  the previous entry's hash) lets you detect tampering without a
  separate blockchain / HSM.

Usage anywhere in the app:

    from ..services.audit_service import audit

    # Minimal
    audit.log(event="login_success", user_id=user["id"], ip=client_ip)

    # Rich
    audit.log(
        event="ticket_updated",
        user_id=user["id"],
        entity_type="ticket",
        entity_id=ticket_id,
        old_value={"status": "assigned"},
        new_value={"status": "in-progress"},
        ip=client_ip,
        user_agent=user_agent,
        success=True,
    )
"""

from __future__ import annotations

import hashlib
import json
import logging
import queue
import re
import threading
import time
import traceback
import uuid
from datetime import datetime, timezone
from typing import Any

from ..core.config import settings

logger = logging.getLogger("audit")

# ── Event name catalogue ────────────────────────────────────────────────────
# Keeping names in constants avoids typos scattered across the codebase.

class AuditEvent:
    # Auth — web
    LOGIN_SUCCESS      = "login_success"
    LOGIN_FAILED       = "login_failed"
    LOGIN_LOCKED       = "login_locked"
    LOGOUT             = "logout"
    SESSION_REFRESH    = "session_refresh"
    SESSION_HIJACK     = "session_hijack_attempt"
    # Auth — mobile
    MOBILE_LOGIN_SUCCESS = "mobile_login_success"
    MOBILE_LOGIN_FAILED  = "mobile_login_failed"
    MOBILE_LOGOUT        = "mobile_logout"
    # Account management
    ACCOUNT_CREATED    = "account_created"
    ACCOUNT_DISABLED   = "account_disabled"
    ACCOUNT_ENABLED    = "account_enabled"
    # Tickets
    TICKET_CREATED     = "ticket_created"
    TICKET_UPDATED     = "ticket_updated"
    TICKET_VIEWED      = "ticket_viewed"
    TICKET_STATUS_CHANGED = "ticket_status_changed"
    # Reports
    REPORT_SUBMITTED   = "report_submitted"
    REPORT_APPROVED    = "report_approved"
    REPORT_VIEWED      = "report_viewed"
    FOLLOW_UP_REQUESTED = "follow_up_requested"
    # Technician assignment
    TECHNICIAN_ASSIGNED = "technician_assigned"
    TECHNICIAN_REMOVED  = "technician_removed"
    # Ticket cancellation
    TICKET_CANCELLED    = "ticket_cancelled"
    # Files
    FILE_UPLOADED      = "file_uploaded"
    FILE_DOWNLOADED    = "file_downloaded"
    PHOTO_UPLOADED     = "photo_uploaded"
    # Zone pipeline
    ZONE_PIPELINE_RUN  = "zone_pipeline_run"
    # Security
    CSRF_REJECTED      = "csrf_rejected"
    RATE_LIMIT_HIT     = "rate_limit_hit"
    # System / config
    SYSTEM_STARTUP     = "system_startup"

# Events that trigger an elevated-priority alert log line (check your SIEM/alerting on these).
CRITICAL_EVENTS = {
    AuditEvent.SESSION_HIJACK,
    AuditEvent.LOGIN_LOCKED,
    AuditEvent.ACCOUNT_DISABLED,
    AuditEvent.CSRF_REJECTED,
    AuditEvent.RATE_LIMIT_HIT,
}

# ── Sanitisation helpers ────────────────────────────────────────────────────

_INJECTION_CHARS = re.compile(r"[\r\n\x00]")

def _clean(value: str | None, max_len: int = 512) -> str | None:
    """Strip log-injection chars and truncate."""
    if value is None:
        return None
    return _INJECTION_CHARS.sub(" ", value)[:max_len]


def _redact_meta(meta: dict | None) -> dict | None:
    """Remove any key that smells like a secret before persisting."""
    if not meta:
        return meta
    secret_keys = {"password", "token", "secret", "key", "auth", "credential"}
    return {
        k: "[REDACTED]" if any(s in k.lower() for s in secret_keys) else v
        for k, v in meta.items()
    }


# ── Chain hash ─────────────────────────────────────────────────────────────
# Each row stores a hash of (its own content) + (the previous row's hash).
# Truncating or reordering rows breaks the chain and is detectable.

_chain_lock = threading.Lock()
_prev_hash: str = "genesis"  # in-process; reload from DB on restart for full continuity


def _compute_chain_hash(row_content: dict, prev_hash: str) -> str:
    canonical = json.dumps(row_content, sort_keys=True, ensure_ascii=True, default=str)
    raw = f"{prev_hash}:{canonical}"
    return hashlib.sha256(raw.encode()).hexdigest()


# ── Background writer ───────────────────────────────────────────────────────

_QUEUE_MAX = 2_000  # drop oldest if the DB is totally unresponsive
_FLUSH_BATCH = 50   # rows per DB round-trip
_FLUSH_INTERVAL = 2  # seconds — flush even if batch not full


class _AuditWriter(threading.Thread):
    """Daemon thread that drains the queue and batch-inserts to Supabase."""

    def __init__(self) -> None:
        super().__init__(name="audit-writer", daemon=True)
        self._q: queue.Queue[dict] = queue.Queue(maxsize=_QUEUE_MAX)
        self._stop = threading.Event()

    def enqueue(self, row: dict) -> None:
        try:
            self._q.put_nowait(row)
        except queue.Full:
            # Drop and log — never block the request thread
            logger.error("[audit] queue FULL — event dropped: %s", row.get("event"))

    def run(self) -> None:
        batch: list[dict] = []
        last_flush = time.monotonic()

        while not self._stop.is_set():
            # Drain up to _FLUSH_BATCH items
            while len(batch) < _FLUSH_BATCH:
                try:
                    row = self._q.get(timeout=0.1)
                    batch.append(row)
                    self._q.task_done()
                except queue.Empty:
                    break

            now = time.monotonic()
            if batch and (len(batch) >= _FLUSH_BATCH or (now - last_flush) >= _FLUSH_INTERVAL):
                self._flush(batch)
                batch = []
                last_flush = now

        # Drain remainder on shutdown
        while not self._q.empty():
            try:
                batch.append(self._q.get_nowait())
                self._q.task_done()
            except queue.Empty:
                break
        if batch:
            self._flush(batch)

    def _flush(self, rows: list[dict]) -> None:
        try:
            from ..core.dependencies import get_supabase
            sb = get_supabase()
            sb.table("audit_log").insert(rows).execute()
            logger.debug("[audit] flushed %d row(s)", len(rows))
        except Exception:
            logger.error("[audit] flush FAILED:\n%s", traceback.format_exc())

    def shutdown(self) -> None:
        self._stop.set()


_writer = _AuditWriter()
_writer.start()


# ── Public API ─────────────────────────────────────────────────────────────

class AuditService:
    """Thread-safe, non-blocking audit logger."""

    def log(
        self,
        *,
        event: str,
        user_id: str | None = None,
        credential: str | None = None,
        entity_type: str | None = None,
        entity_id: str | None = None,
        old_value: Any = None,
        new_value: Any = None,
        ip: str | None = None,
        user_agent: str | None = None,
        request_id: str | None = None,
        success: bool = True,
        error_message: str | None = None,
        meta: dict | None = None,
    ) -> None:
        """Enqueue one audit log entry (non-blocking).

        All fields are optional except `event`.  Pass `old_value` /
        `new_value` as plain dicts — they are JSON-serialised for the
        `changes` column.
        """
        rid = request_id or str(uuid.uuid4())[:8]

        changes: dict | None = None
        if old_value is not None or new_value is not None:
            changes = {"old": old_value, "new": new_value}

        row_content = {
            "event":        event,
            "user_id":      user_id,
            "credential":   _clean(credential, 256),
            "entity_type":  entity_type,
            "entity_id":    entity_id,
            "changes":      changes,
            "ip":           _clean(ip, 64),
            "user_agent":   _clean(user_agent, 512),
            "request_id":   rid,
            "success":      success,
            "error_message": _clean(error_message, 1024),
            "meta":         _redact_meta(meta),
            # created_at is set by DB default (now()) — not sent here
        }

        # Chain hash — compute under lock to maintain ordering
        with _chain_lock:
            global _prev_hash
            chain = _compute_chain_hash(row_content, _prev_hash)
            _prev_hash = chain

        row_content["chain_hash"] = chain

        if event in CRITICAL_EVENTS:
            logger.warning(
                "[audit:CRITICAL] event=%s user_id=%s credential=%s ip=%s success=%s err=%s",
                event, user_id, credential, ip, success, error_message,
            )
        else:
            logger.info(
                "[audit] event=%s user_id=%s entity=%s/%s ip=%s success=%s",
                event, user_id, entity_type, entity_id, ip, success,
            )

        _writer.enqueue(row_content)

        # Real-time fan-out: translate this audit event into SSE invalidation
        # signal(s) for the web dashboard. Non-blocking and best-effort — a
        # failure here must never affect the audited operation. Local import
        # keeps module load order independent of the events broker.
        try:
            from .events_service import publish_from_audit
            publish_from_audit(
                event=event,
                entity_type=entity_type,
                entity_id=entity_id,
                meta=meta,
            )
        except Exception:  # pragma: no cover - defensive; never break audit
            logger.error("[audit] event publish failed", exc_info=True)

    # ── Convenience wrappers ────────────────────────────────────────────────

    def login_success(self, *, user_id: str, credential: str, ip: str, user_agent: str, platform: str = "web") -> None:
        evt = AuditEvent.LOGIN_SUCCESS if platform == "web" else AuditEvent.MOBILE_LOGIN_SUCCESS
        self.log(event=evt, user_id=user_id, credential=credential, ip=ip, user_agent=user_agent,
                 success=True, meta={"platform": platform})

    def login_failed(self, *, credential: str, ip: str, user_agent: str = "", reason: str = "", platform: str = "web") -> None:
        evt = AuditEvent.LOGIN_FAILED if platform == "web" else AuditEvent.MOBILE_LOGIN_FAILED
        self.log(event=evt, credential=credential, ip=ip, user_agent=user_agent,
                 success=False, error_message=reason, meta={"platform": platform})

    def login_locked(self, *, credential: str, ip: str, seconds_remaining: float) -> None:
        self.log(
            event=AuditEvent.LOGIN_LOCKED,
            credential=credential, ip=ip, success=False,
            meta={"locked_for_seconds": int(seconds_remaining)},
        )

    def logout(self, *, user_id: str, ip: str, platform: str = "web") -> None:
        evt = AuditEvent.LOGOUT if platform == "web" else AuditEvent.MOBILE_LOGOUT
        self.log(event=evt, user_id=user_id, ip=ip, meta={"platform": platform})

    def session_refresh(self, *, user_id: str, ip: str) -> None:
        self.log(event=AuditEvent.SESSION_REFRESH, user_id=user_id, ip=ip)

    def session_hijack_attempt(self, *, user_id: str, ip: str, user_agent: str) -> None:
        self.log(event=AuditEvent.SESSION_HIJACK, user_id=user_id,
                 ip=ip, user_agent=user_agent, success=False,
                 error_message="Session fingerprint mismatch")

    def account_created(self, *, actor_id: str, new_user_id: str, ip: str) -> None:
        self.log(event=AuditEvent.ACCOUNT_CREATED, user_id=actor_id,
                 entity_type="profile", entity_id=new_user_id, ip=ip)

    def account_toggled(self, *, actor_id: str, target_id: str, is_active: bool, ip: str) -> None:
        evt = AuditEvent.ACCOUNT_ENABLED if is_active else AuditEvent.ACCOUNT_DISABLED
        self.log(event=evt, user_id=actor_id, entity_type="profile", entity_id=target_id,
                 new_value={"is_active": is_active}, ip=ip)

    def ticket_created(self, *, actor_id: str, ticket_id: str, ip: str, meta: dict | None = None) -> None:
        self.log(event=AuditEvent.TICKET_CREATED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id, ip=ip, meta=meta)

    def ticket_updated(self, *, actor_id: str, ticket_id: str, old: dict, new: dict, ip: str) -> None:
        self.log(event=AuditEvent.TICKET_UPDATED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id,
                 old_value=old, new_value=new, ip=ip)

    def ticket_status_changed(self, *, actor_id: str, ticket_id: str, old_status: str, new_status: str, ip: str) -> None:
        self.log(event=AuditEvent.TICKET_STATUS_CHANGED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id,
                 old_value={"status": old_status}, new_value={"status": new_status}, ip=ip)

    def report_submitted(self, *, actor_id: str, report_id: str, ticket_id: str, ip: str) -> None:
        self.log(event=AuditEvent.REPORT_SUBMITTED, user_id=actor_id,
                 entity_type="inspection_report", entity_id=report_id,
                 ip=ip, meta={"ticket_id": ticket_id})

    def report_approved(self, *, actor_id: str, report_id: str, ticket_id: str, ip: str) -> None:
        self.log(event=AuditEvent.REPORT_APPROVED, user_id=actor_id,
                 entity_type="inspection_report", entity_id=report_id,
                 ip=ip, meta={"ticket_id": ticket_id})

    def file_uploaded(self, *, actor_id: str, entity_type: str, entity_id: str,
                      file_name: str, file_size: int, ip: str) -> None:
        self.log(event=AuditEvent.FILE_UPLOADED, user_id=actor_id,
                 entity_type=entity_type, entity_id=entity_id, ip=ip,
                 meta={"file_name": file_name, "file_size_bytes": file_size})

    def follow_up_requested(self, *, actor_id: str, ticket_id: str, notes: str, ip: str) -> None:
        self.log(event=AuditEvent.FOLLOW_UP_REQUESTED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id, ip=ip,
                 meta={"follow_up_notes": notes[:256]})

    def technician_assigned(self, *, actor_id: str, ticket_id: str,
                            added_ids: list[str], all_ids: list[str], ip: str,
                            reason: str | None = None) -> None:
        meta: dict[str, Any] = {"added": added_ids}
        if reason:
            meta["reason"] = reason[:256]
        self.log(event=AuditEvent.TECHNICIAN_ASSIGNED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id, ip=ip,
                 new_value={"technician_ids": all_ids},
                 meta=meta)

    def technician_removed(self, *, actor_id: str, ticket_id: str,
                           removed_id: str, remaining_ids: list[str], ip: str,
                           reason: str | None = None) -> None:
        meta: dict[str, Any] | None = {"reason": reason[:256]} if reason else None
        self.log(event=AuditEvent.TECHNICIAN_REMOVED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id, ip=ip,
                 old_value={"removed_technician_id": removed_id},
                 new_value={"technician_ids": remaining_ids},
                 meta=meta)

    def ticket_cancelled(self, *, actor_id: str, ticket_id: str, reason: str, ip: str) -> None:
        self.log(event=AuditEvent.TICKET_CANCELLED, user_id=actor_id,
                 entity_type="ticket", entity_id=ticket_id, ip=ip,
                 new_value={"status": "cancelled"},
                 meta={"reason": reason[:256]})

    def zone_pipeline_run(self, *, actor_id: str, ip: str,
                          anomaly_count: int, station_count: int) -> None:
        self.log(event=AuditEvent.ZONE_PIPELINE_RUN, user_id=actor_id, ip=ip,
                 meta={"anomaly_count": anomaly_count, "station_count": station_count})


# Module-level singleton — import this everywhere
audit = AuditService()
