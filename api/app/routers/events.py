"""Server-Sent Events (SSE) — real-time push to the web dashboard.

  GET /api/events  — authenticated event stream (text/event-stream)

The browser opens ONE ``EventSource`` to this endpoint (cookie-authenticated;
``EventSource`` sends cookies automatically with ``withCredentials``). The server
subscribes the connection to the in-process event broker (``events_service``) and
streams tiny invalidation signals as they happen. The frontend reacts by
revalidating the matching SWR cache keys.

No CSRF is required: this is a GET, and CSRF only guards mutating methods.
A periodic heartbeat comment keeps proxies and the TCP connection alive.
"""

import asyncio
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import StreamingResponse

from ..core.dependencies import get_current_user
from ..services import events_service

router = APIRouter(prefix="/api", tags=["events"])

# Seconds between heartbeats when no real event arrives. Comfortably under the
# typical 30–60 s idle-connection timeout of proxies/load balancers.
_HEARTBEAT_SECONDS = 20.0


async def _event_stream(request: Request):
    """Async generator producing the SSE wire format for one client."""
    agen = events_service.subscribe()
    # Tell the browser to wait 5 s before reconnecting after a drop.
    yield "retry: 5000\n\n"
    try:
        while True:
            # Stop promptly if the client navigated away / closed the tab.
            if await request.is_disconnected():
                break
            try:
                event = await asyncio.wait_for(agen.__anext__(), timeout=_HEARTBEAT_SECONDS)
            except asyncio.TimeoutError:
                # No event in the window — send a heartbeat comment (ignored by
                # EventSource) to keep the connection open through proxies.
                yield ": ping\n\n"
                continue
            if event.get("_close"):
                break
            yield f"data: {json.dumps(event)}\n\n"
    finally:
        # Closing the generator runs its ``finally`` → discards the subscriber
        # queue from the broker. Guarantees no leak on disconnect.
        await agen.aclose()


@router.get("/events")
async def events_stream(request: Request, _user: dict = Depends(get_current_user)):
    """Authenticated SSE stream. One long-lived connection per browser tab."""
    return StreamingResponse(
        _event_stream(request),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            # Disable proxy buffering (nginx) so events flush immediately.
            "X-Accel-Buffering": "no",
        },
    )
