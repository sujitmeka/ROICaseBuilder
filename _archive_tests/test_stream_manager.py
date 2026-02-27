"""Tests for the StreamManager pub/sub and replay system."""

import asyncio

import pytest

from backend.streaming.events import PipelineEventType, SSEEvent
from backend.streaming.manager import StreamManager


def _make_event(seq: int, event_type: PipelineEventType = PipelineEventType.PIPELINE_STARTED) -> SSEEvent:
    return SSEEvent(event_type=event_type, data={"seq": seq}, sequence_id=seq)


class TestStreamManager:
    @pytest.mark.asyncio
    async def test_subscribe_returns_queue(self):
        """subscribe() returns an asyncio.Queue."""
        manager = StreamManager()
        queue = await manager.subscribe("case-1")
        assert isinstance(queue, asyncio.Queue)

    @pytest.mark.asyncio
    async def test_emit_delivers_to_subscriber(self):
        """Subscribe, emit event, get from queue."""
        manager = StreamManager()
        queue = await manager.subscribe("case-1")
        event = _make_event(1)
        await manager.emit("case-1", event)
        received = await asyncio.wait_for(queue.get(), timeout=1.0)
        assert received.sequence_id == 1

    @pytest.mark.asyncio
    async def test_emit_delivers_to_multiple_subscribers(self):
        """Two subscribers both receive the same emitted event."""
        manager = StreamManager()
        q1 = await manager.subscribe("case-1")
        q2 = await manager.subscribe("case-1")
        event = _make_event(1)
        await manager.emit("case-1", event)
        r1 = await asyncio.wait_for(q1.get(), timeout=1.0)
        r2 = await asyncio.wait_for(q2.get(), timeout=1.0)
        assert r1.sequence_id == 1
        assert r2.sequence_id == 1

    @pytest.mark.asyncio
    async def test_unsubscribe_stops_delivery(self):
        """After unsubscribe, the queue should not receive new events."""
        manager = StreamManager()
        queue = await manager.subscribe("case-1")
        await manager.unsubscribe("case-1", queue)
        await manager.emit("case-1", _make_event(1))
        assert queue.empty()

    @pytest.mark.asyncio
    async def test_replay_missed_events_on_reconnect(self):
        """event_generator replays events with seq > last_event_id."""
        manager = StreamManager()

        # Emit 3 events before anyone subscribes via generator
        await manager.emit("case-1", _make_event(1))
        await manager.emit("case-1", _make_event(2))
        await manager.emit("case-1", _make_event(3))

        # Generator with last_event_id=1 should replay events 2 and 3
        gen = manager.event_generator("case-1", last_event_id=1)
        results = []
        # First yield is the heartbeat comment, then replayed events
        results.append(await gen.__anext__())  # heartbeat
        results.append(await gen.__anext__())  # event 2
        results.append(await gen.__anext__())  # event 3

        assert "id: 2" in results[1]
        assert "id: 3" in results[2]
