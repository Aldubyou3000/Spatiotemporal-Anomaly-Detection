"""Idle heartbeats must preserve subscriptions instead of triggering reconnects."""
import asyncio
import os
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
for key, value in {"SUPABASE_URL": "http://127.0.0.1:1", "SUPABASE_SERVICE_ROLE_KEY": "test", "SUPABASE_ANON_KEY": "test", "SUPABASE_JWT_SECRET": "test"}.items():
    os.environ.setdefault(key, value)

from app.routers import events, mobile_events
from app.services import events_service


class ConnectedRequest:
    async def is_disconnected(self):
        return False


class EventStreamTests(unittest.IsolatedAsyncioTestCase):
    async def test_idle_streams_survive_heartbeats_and_deliver_later_events(self):
        for module, factory, expected in (
            (events, events._event_stream, '"id": "private-id"'),
            (mobile_events, mobile_events._mobile_event_stream, 'data: {"resource": "tickets"}\n\n'),
        ):
            with self.subTest(module=module.__name__), patch.object(module, "_HEARTBEAT_SECONDS", 0.001):
                stream = factory(ConnectedRequest())
                before = len(events_service._subscribers)
                try:
                    self.assertEqual(await anext(stream), "retry: 5000\n\n")
                    for _ in range(3):
                        self.assertEqual(await asyncio.wait_for(anext(stream), 1), ": ping\n\n")
                        self.assertEqual(len(events_service._subscribers), before + 1)
                    events_service._enqueue({"resource": "tickets", "id": "private-id"})
                    self.assertIn(expected, await asyncio.wait_for(anext(stream), 1))
                    await events_service.shutdown()
                    with self.assertRaises(StopAsyncIteration):
                        await anext(stream)
                finally:
                    await stream.aclose()
                self.assertEqual(len(events_service._subscribers), before)


if __name__ == "__main__":
    unittest.main()
