"""Tests for the agentic orchestrator integration."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator, TOOL_EVENT_MAP
from backend.streaming.manager import StreamManager
from backend.streaming.events import PipelineEventType


class TestToolEventMapping:
    """Verify tool-to-SSE-event mapping is correct."""

    def test_fetch_financials_maps_to_data_fetch(self):
        started, completed = TOOL_EVENT_MAP["mcp__cproi__fetch_financials"]
        assert started == PipelineEventType.DATA_FETCH_STARTED
        assert completed == PipelineEventType.DATA_FETCH_COMPLETED

    def test_websearch_maps_to_benchmark(self):
        started, completed = TOOL_EVENT_MAP["WebSearch"]
        assert started == PipelineEventType.BENCHMARK_SEARCH_STARTED
        assert completed == PipelineEventType.BENCHMARK_FOUND

    def test_run_calculation_maps_to_calculation(self):
        started, completed = TOOL_EVENT_MAP["mcp__cproi__run_calculation"]
        assert started == PipelineEventType.CALCULATION_STARTED
        assert completed == PipelineEventType.CALCULATION_COMPLETED

    def test_all_custom_tools_mapped(self):
        """Every custom tool should have an event mapping."""
        assert "mcp__cproi__fetch_financials" in TOOL_EVENT_MAP
        assert "mcp__cproi__scrape_company" in TOOL_EVENT_MAP
        assert "mcp__cproi__run_calculation" in TOOL_EVENT_MAP
        assert "mcp__cproi__load_methodology" in TOOL_EVENT_MAP


class TestOrchestratorConfig:

    @pytest.mark.asyncio
    async def test_stream_manager_receives_pipeline_started(self):
        """When the orchestrator runs, it should emit PIPELINE_STARTED."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            stream_manager = StreamManager()
            events_received: list = []
            original_emit = stream_manager.emit

            async def capture_emit(case_id, event):
                events_received.append(event)
                await original_emit(case_id, event)

            stream_manager.emit = capture_emit

            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            event_types = [e.event_type for e in events_received]
            assert PipelineEventType.PIPELINE_STARTED in event_types
