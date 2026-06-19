"""Server-Sent Events for the technician mobile app — hardened, zero-leak.

  GET /api/mobile/events  — Bearer-authenticated event stream (text/event-stream)

This subscribes to the SAME in-process broker as the web SSE endpoint, but every
signal is run through ``events_service.project_for_mobile`` before it reaches the
wire. That projection:
  - drops the entity ``id`` (a technician must never receive ticket IDs for
    tickets they aren't assigned to — not even as metadata), and
  - forwards ONLY the ``tickets``/``reports`` resources (``technicians``/``audit``
    are analyst-only and never sent to mobile).

So the channel carries a content-free nudge — "something in your ticket world may
have changed" — and the app reacts by refetching ``GET /api/mobile/tickets``,
which is already filtered to the technician's own assignments (+ RLS). The
realtime layer conveys no sensitive data, so it cannot widen access.

Auth: ``require_technician_mobile`` (Bearer + role check), identical to every
other ``/api/mobile/*`` route. The token is sent in the ``Authorization`` header
by the client (react-native-sse) — never in the URL.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.dependencies import require_technician_mobile
from ..services import events_service

router = APIRouter(prefix="/api/mobile", tags=["mobile", "events"])

_HEARTBEAT_SECONDS = 20.0


async def _mobile_event_stream(request: Request):
    """SSE wire format for one technician — every event is sanitized first."""
    agen = events_service.subscribe()
    yield "retry: 5000\n\n"
    try:
        while True:
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(agen.__anext__(), timeout=_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                yield ": ping\n\n"
                continue
            if event.get("_close"):
                break
            projected = events_service.project_for_mobile(event)
            if projected is None:
                continue  # analyst-only resource — never reaches mobile
            yield f"data: {json.dumps(projected)}\n\n"
    finally:
        # Generator close runs subscribe()'s finally → removes the queue. No leak.
        await agen.aclose()


@router.get("/events")
async def mobile_events_stream(
    request: Request,
    _user: dict = Depends(require_technician_mobile),
):
    """Authenticated SSE stream for one technician device. Content-free nudges only."""
    return StreamingResponse(
        _mobile_event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
