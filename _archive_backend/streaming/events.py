"""SSE event types and serialization for the CPROI pipeline."""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum
from typing import Any


class PipelineEventType(str, Enum):
    """All event types emitted during a CPROI pipeline run."""

    # Pipeline lifecycle
    PIPELINE_STARTED = "pipeline_started"
    PIPELINE_COMPLETED = "pipeline_completed"
    PIPELINE_ERROR = "pipeline_error"

    # Company identification
    COMPANY_IDENTIFIED = "company_identified"
    COMPANY_CLASSIFIED = "company_classified"

    # Data fetching
    DATA_FETCH_STARTED = "data_fetch_started"
    DATA_FETCH_PROGRESS = "data_fetch_progress"
    DATA_FETCH_COMPLETED = "data_fetch_completed"

    # Benchmark search
    BENCHMARK_SEARCH_STARTED = "benchmark_search_started"
    BENCHMARK_FOUND = "benchmark_found"
    BENCHMARK_SEARCH_COMPLETED = "benchmark_search_completed"

    # Calculation
    CALCULATION_STARTED = "calculation_started"
    KPI_CALCULATED = "kpi_calculated"
    CALCULATION_COMPLETED = "calculation_completed"

    # Narrative generation
    NARRATIVE_STARTED = "narrative_started"
    NARRATIVE_CHUNK = "narrative_chunk"
    NARRATIVE_COMPLETED = "narrative_completed"

    # Confidence and conflicts
    CONFIDENCE_SCORE_COMPUTED = "confidence_score_computed"
    CONFLICT_DETECTED = "conflict_detected"
    CONFLICT_RESOLVED = "conflict_resolved"

    # Agent activity (for "thinking" UX)
    AGENT_THINKING = "agent_thinking"
    TOOL_CALL_STARTED = "tool_call_started"
    TOOL_CALL_COMPLETED = "tool_call_completed"
    DATA_POINT_FOUND = "data_point_found"

    # Overrides and recalculation
    OVERRIDE_APPLIED = "override_applied"
    RECALCULATION_STARTED = "recalculation_started"
    RECALCULATION_COMPLETED = "recalculation_completed"


@dataclass
class SSEEvent:
    """A single Server-Sent Event ready for wire serialization."""

    event_type: PipelineEventType
    data: dict[str, Any]
    sequence_id: int
    timestamp: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))

    def to_sse_string(self) -> str:
        """Serialize to SSE wire format.

        Uses unnamed events (no ``event:`` line) so the browser
        EventSource ``onmessage`` handler fires correctly.  The event
        type is embedded inside the JSON ``data`` payload as ``type``.
        """
        payload = {
            "type": self.event_type.value,
            **self.data,
            "timestamp": self.timestamp.isoformat(),
        }
        data_json = json.dumps(payload, default=str)
        return f"data: {data_json}\nid: {self.sequence_id}\n\n"
