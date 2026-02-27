"""Tests for SSE event types and serialization."""

import json

from backend.streaming.events import PipelineEventType, SSEEvent


class TestSSEEvent:
    def test_serializes_to_sse_format(self):
        """Create an SSEEvent, call to_sse_string(), assert format."""
        event = SSEEvent(
            event_type=PipelineEventType.PIPELINE_STARTED,
            data={"case_id": "abc-123"},
            sequence_id=1,
        )
        sse_str = event.to_sse_string()
        assert "event:" in sse_str
        assert "data:" in sse_str
        assert "id:" in sse_str
        assert sse_str.endswith("\n\n")

    def test_all_event_types_defined(self):
        """Assert at least 20 event types are defined."""
        assert len(PipelineEventType) >= 20

    def test_event_payload_is_valid_json(self):
        """Parse the data field from to_sse_string() and verify it's valid JSON."""
        event = SSEEvent(
            event_type=PipelineEventType.KPI_CALCULATED,
            data={"kpi": "conversion_rate", "value": 0.035},
            sequence_id=42,
        )
        sse_str = event.to_sse_string()
        # Extract the data line
        for line in sse_str.strip().split("\n"):
            if line.startswith("data:"):
                data_part = line[len("data:"):].strip()
                parsed = json.loads(data_part)
                assert "kpi" in parsed
                assert parsed["value"] == 0.035
                break
        else:
            raise AssertionError("No data: line found in SSE output")
