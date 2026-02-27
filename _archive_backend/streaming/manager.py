"""StreamManager — per-case event buffering and SSE subscriber management."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import AsyncGenerator

from .events import PipelineEventType, SSEEvent

# Events that signal the pipeline is done — stop streaming after these.
_TERMINAL_EVENTS = {PipelineEventType.PIPELINE_COMPLETED, PipelineEventType.PIPELINE_ERROR}


class StreamManager:
    """Manages SSE event distribution for active pipeline cases.

    Each case_id has:
    - A list of subscriber queues (asyncio.Queue instances)
    - A buffer of all emitted events for replay on reconnect
    """

    def __init__(self) -> None:
        self._subscribers: dict[str, list[asyncio.Queue[SSEEvent]]] = defaultdict(list)
        self._buffers: dict[str, list[SSEEvent]] = defaultdict(list)

    async def subscribe(self, case_id: str) -> asyncio.Queue[SSEEvent]:
        """Create and return a new subscriber queue for a case."""
        queue: asyncio.Queue[SSEEvent] = asyncio.Queue()
        self._subscribers[case_id].append(queue)
        return queue

    async def unsubscribe(self, case_id: str, queue: asyncio.Queue[SSEEvent]) -> None:
        """Remove a subscriber queue from a case."""
        subs = self._subscribers.get(case_id, [])
        if queue in subs:
            subs.remove(queue)
        # Bug 11 fix: clean up buffers when last subscriber leaves
        if not self._subscribers.get(case_id):
            self._buffers.pop(case_id, None)
            self._subscribers.pop(case_id, None)

    async def emit(self, case_id: str, event: SSEEvent) -> None:
        """Broadcast an event to all subscribers and buffer it for replay."""
        self._buffers[case_id].append(event)
        for queue in self._subscribers[case_id]:
            await queue.put(event)

    async def event_generator(
        self, case_id: str, last_event_id: int | None = None
    ) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE strings for a case.

        Always replays buffered events (Bug 4 fix: even on initial
        connection when last_event_id is None — events may have been
        emitted before the client connected).
        """
        queue = await self.subscribe(case_id)
        try:
            # SSE comment as connection heartbeat (ignored by browsers)
            yield ": connected\n\n"

            # Bug 4 fix: always replay buffered events. On reconnect,
            # only replay events after last_event_id. On initial connect,
            # replay everything that was buffered before the client arrived.
            threshold = last_event_id if last_event_id is not None else 0
            already_terminal = False
            for event in self._buffers.get(case_id, []):
                if event.sequence_id > threshold:
                    yield event.to_sse_string()
                    if event.event_type in _TERMINAL_EVENTS:
                        already_terminal = True

            # If pipeline already finished before we connected, stop.
            if already_terminal:
                return

            # Bug 10 fix: break after terminal events instead of looping forever.
            while True:
                event = await queue.get()
                yield event.to_sse_string()
                if event.event_type in _TERMINAL_EVENTS:
                    return
        finally:
            await self.unsubscribe(case_id, queue)
