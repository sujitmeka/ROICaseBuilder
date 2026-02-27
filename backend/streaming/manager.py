"""StreamManager — per-case event buffering and SSE subscriber management."""

from __future__ import annotations

import asyncio
from collections import defaultdict
from typing import AsyncGenerator

from .events import SSEEvent


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

    async def emit(self, case_id: str, event: SSEEvent) -> None:
        """Broadcast an event to all subscribers and buffer it for replay."""
        self._buffers[case_id].append(event)
        for queue in self._subscribers[case_id]:
            await queue.put(event)

    async def event_generator(
        self, case_id: str, last_event_id: int | None = None
    ) -> AsyncGenerator[str, None]:
        """Async generator yielding SSE strings for a case.

        If last_event_id is provided, replays buffered events with
        sequence_id > last_event_id before switching to live events.
        """
        queue = await self.subscribe(case_id)
        try:
            # SSE comment as connection heartbeat (ignored by browsers)
            yield ": connected\n\n"

            # Replay missed events from buffer
            if last_event_id is not None:
                for event in self._buffers.get(case_id, []):
                    if event.sequence_id > last_event_id:
                        yield event.to_sse_string()

            # Stream live events
            while True:
                event = await queue.get()
                yield event.to_sse_string()
        finally:
            await self.unsubscribe(case_id, queue)
