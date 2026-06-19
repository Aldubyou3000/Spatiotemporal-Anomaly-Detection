"""Real-time event broker — in-process async pub/sub for Server-Sent Events.

Design
------
- FastAPI is the *sole writer* of all application data (web analysts and mobile
  technicians both mutate only through FastAPI services). Every meaningful
  mutation already calls ``audit.log(...)``. So this broker is fed from a single
  hook inside the audit service (see ``publish_from_audit``) and therefore
  captures every change — web AND mobile — with no per-router wiring.

- The browser never connects to Supabase. It opens ONE ``EventSource`` to
  ``GET /api/events`` (see ``routers/events.py``), which subscribes to this
  broker and streams tiny invalidation signals. The frontend reacts by
  revalidating the matching SWR cache keys through the normal authenticated
  fetch path — so payloads stay minimal and no serialization logic is dupliated.

- Payloads are advisory *signals*, never full rows:
      {"resource": "tickets", "action": "updated", "id": "<uuid|null>", "ts": 0.0}

Threading
---------
FastAPI runs sync path-operations and ``audit.log`` inside a Starlette
threadpool thread. ``asyncio.Queue`` is **not** thread-safe, so a producer on a
worker thread must hand the event to the event loop via
``loop.call_soon_threadsafe``. ``init_loop()`` captures the running loop at
startup to make that bridge possible. ``publish()`` is the thread-safe entry
point that all producers use.

Multi-worker caveat
-------------------
This broker fans out within a SINGLE uvicorn worker process only. If the API is
ever run with ``--workers N`` (or multiple replicas), a client connected to
worker A will NOT receive events from a mutation served by worker B. v1 runs a
single worker (matches the documented launch command). The upgrade path is a
Redis pub/sub backplane: only this module changes — ``publish()`` would also
``redis.publish(...)`` and each worker would run a task subscribed to that
channel calling ``_enqueue`` locally. The SSE endpoint and the entire frontend
stay identical because the signal contract is unchanged.
"""

from __future__ import annotations

import asyncio
import logging
import time
from typing import Any, AsyncGenerator

logger = logging.getLogger("events")

# One bounded queue per connected SSE client. Signals are tiny and idempotent
# (the next mutate() reconciles state), so a slow client drops its oldest
# backlog rather than blocking producers — "latest state wins".
_QUEUE_MAX = 100

_subscribers: set[asyncio.Queue] = set()
_loop: asyncio.AbstractEventLoop | None = None

# Sentinel pushed to every subscriber on shutdown so SSE generators break promptly.
_CLOSE = {"_close": True}


# ── Lifecycle ────────────────────────────────────────────────────────────────

def init_loop() -> None:
    """Capture the running event loop. MUST be called from within the loop
    (e.g. a FastAPI startup coroutine) so thread producers can bridge to it."""
    global _loop
    _loop = asyncio.get_running_loop()
    logger.info("[events] broker loop captured")


async def shutdown() -> None:
    """Push the close sentinel to every subscriber so open SSE streams end."""
    for q in list(_subscribers):
        try:
            q.put_nowait(_CLOSE)
        except asyncio.QueueFull:
            # Drop the oldest item to make room for the close sentinel.
            try:
                q.get_nowait()
                q.put_nowait(_CLOSE)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass
    logger.info("[events] broker shutdown signalled to %d subscriber(s)", len(_subscribers))


# ── Subscribe (consumer side — used by the SSE endpoint) ────────────────────

async def subscribe() -> AsyncGenerator[dict, None]:
    """Yield events for one connected client. The ``finally`` guarantees the
    subscriber queue is removed on disconnect (tab close / navigation)."""
    q: asyncio.Queue = asyncio.Queue(maxsize=_QUEUE_MAX)
    _subscribers.add(q)
    logger.debug("[events] subscriber added (total=%d)", len(_subscribers))
    try:
        while True:
            event = await q.get()
            yield event
    finally:
        _subscribers.discard(q)
        logger.debug("[events] subscriber removed (total=%d)", len(_subscribers))


def subscriber_count() -> int:
    return len(_subscribers)


# ── Mobile projection (security boundary) ───────────────────────────────────
# Technicians must never receive data — or even metadata like ticket IDs — about
# tickets they aren't assigned to. The broker carries ids internally (the web
# dashboard, where analysts see everything, needs them), but the mobile SSE
# endpoint sends ONLY a content-free nudge: no id, no action, and only the
# resources a technician cares about. This sanitization IS the no-leak guarantee
# — the channel conveys nothing sensitive, so it cannot widen access. The actual
# data still flows exclusively through the membership-checked /api/mobile/* routes.

# Resources a technician's stream is allowed to learn about. `technicians` and
# `audit` are analyst-only and are never forwarded to mobile.
_MOBILE_RESOURCES = ("tickets", "reports")


def project_for_mobile(event: dict) -> dict | None:
    """Sanitize a broker signal for a technician stream.

    Returns a content-free nudge ``{"resource": <r>}`` (no id/action/ts), or
    ``None`` if the resource is analyst-only and must not reach mobile at all.
    """
    resource = event.get("resource")
    if resource not in _MOBILE_RESOURCES:
        return None
    return {"resource": resource}


# ── Publish (producer side) ─────────────────────────────────────────────────

def _enqueue(event: dict) -> None:
    """Fan an event into every subscriber queue. Runs ON the loop thread only.
    Drop-oldest on a full queue so one slow client never blocks the rest."""
    for q in list(_subscribers):
        try:
            q.put_nowait(event)
        except asyncio.QueueFull:
            try:
                q.get_nowait()
                q.put_nowait(event)
            except (asyncio.QueueEmpty, asyncio.QueueFull):
                pass


def publish(event: dict) -> None:
    """Thread-safe entry point. Safe to call from async code, sync path-ops, or
    a worker thread. Non-blocking; never raises back onto the producer."""
    loop = _loop
    if loop is None:
        # Broker not started yet (e.g. an event during import) — drop safely.
        return
    try:
        running = asyncio.get_running_loop()
    except RuntimeError:
        running = None
    if running is loop:
        _enqueue(event)
    else:
        # Producer is on a worker thread (or another loop): hand off race-free.
        loop.call_soon_threadsafe(_enqueue, event)


# ── Audit-event → signal mapping ────────────────────────────────────────────
# Single source of truth for which audit events invalidate which data resource.
# Kept here (not in audit_service) so the audit layer stays unaware of the UI.
#
# NB: report submit/approve/follow-up ALSO emit a "tickets" signal because they
# change the parent ticket's status (pending_review -> verified, etc.).

# Maps an audit event name -> the data resource(s) it should invalidate.
_AUDIT_RESOURCE_MAP: dict[str, tuple[str, ...]] = {
    # Tickets
    "ticket_created":         ("tickets",),
    "ticket_updated":         ("tickets",),
    "ticket_status_changed":  ("tickets",),
    "technician_assigned":    ("tickets",),
    "technician_removed":     ("tickets",),
    "ticket_cancelled":       ("tickets",),
    "follow_up_requested":    ("tickets", "reports"),
    # Reports (also touch the ticket status)
    "report_submitted":       ("reports", "tickets"),
    "report_approved":        ("reports", "tickets"),
    # Technician accounts
    "account_created":        ("technicians",),
    "account_enabled":        ("technicians",),
    "account_disabled":       ("technicians",),
}


def _resources_for(event: str, entity_type: str | None) -> tuple[str, ...]:
    """Resolve which data resources an audit event invalidates.

    File/photo uploads route by ``entity_type`` because the same event name is
    reused for ticket attachments (analyst CSVs) and inspection photos (mobile):
      - file/photo on a ticket            -> the ticket detail (attachments tab)
      - file/photo on an inspection_report -> the report view + parent ticket
    """
    if event in ("file_uploaded", "photo_uploaded"):
        if entity_type == "inspection_report":
            return ("reports", "tickets")
        if entity_type == "ticket":
            return ("tickets",)
        return ()
    return _AUDIT_RESOURCE_MAP.get(event, ())


def publish_from_audit(
    *,
    event: str,
    entity_type: str | None = None,
    entity_id: str | None = None,
    meta: dict | None = None,
) -> None:
    """Translate an audit event into real-time invalidation signal(s).

    Called once from ``AuditService.log``. Emits a data-resource signal when the
    event maps to one (file/photo uploads route by ``entity_type``), and ALWAYS
    emits an ``audit`` signal so the Audit Log page stays live. Unmapped events
    (logins, CSRF, zone runs, startup) only produce the ``audit`` signal.
    """
    ts = time.time()

    for resource in _resources_for(event, entity_type):
        # id only meaningful for the entity's own resource; keep it simple and
        # attach entity_id to every emitted resource signal.
        publish({"resource": resource, "action": event, "id": entity_id, "ts": ts})

    # The audit log itself changes on every logged event.
    publish({"resource": "audit", "action": event, "id": entity_id, "ts": ts})
