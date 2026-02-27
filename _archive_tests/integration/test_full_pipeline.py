"""Integration tests for the full CPROI pipeline -- end-to-end with mocked SDK client."""

from unittest.mock import AsyncMock, patch, MagicMock

import pytest

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.events import PipelineEventType
from backend.streaming.manager import StreamManager


class _EmptyAsyncIter:
    """An async iterator that yields nothing."""
    def __aiter__(self):
        return self

    async def __anext__(self):
        raise StopAsyncIteration


def _setup_mock_client(MockClient):
    """Wire up the mock ClaudeSDKClient for tests."""
    mock_client = AsyncMock()
    MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
    MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
    mock_client.query = AsyncMock()
    mock_client.receive_response = MagicMock(return_value=_EmptyAsyncIter())
    return mock_client


@pytest.mark.integration
class TestFullPipeline:
    """End-to-end pipeline tests with mocked SDK client."""

    @pytest.mark.asyncio
    async def test_orchestrator_returns_dict_result(self):
        """CPROIOrchestrator.run() returns a dict with case_id and narrative."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            _setup_mock_client(MockClient)

            orchestrator = CPROIOrchestrator()
            result = await orchestrator.run(
                "Nike", "retail", "experience-transformation-design",
                case_id="test-full-001",
            )

            assert isinstance(result, dict)
            assert result["case_id"] == "test-full-001"
            assert "narrative" in result

    @pytest.mark.asyncio
    async def test_orchestrator_emits_sse_events(self):
        """After run(), the StreamManager buffer has PIPELINE_STARTED and PIPELINE_COMPLETED."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            _setup_mock_client(MockClient)

            stream_manager = StreamManager()
            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            result = await orchestrator.run(
                "Nike", "retail", "experience-transformation-design",
                case_id="test-case-001",
            )

            # Check buffered events
            buffer = stream_manager._buffers.get("test-case-001", [])
            event_types = [e.event_type for e in buffer]

            assert PipelineEventType.PIPELINE_STARTED in event_types, (
                f"PIPELINE_STARTED not found in {event_types}"
            )
            assert PipelineEventType.PIPELINE_COMPLETED in event_types, (
                f"PIPELINE_COMPLETED not found in {event_types}"
            )

    @pytest.mark.asyncio
    async def test_orchestrator_runs_without_stream_manager(self):
        """Orchestrator should work even without a stream manager."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            _setup_mock_client(MockClient)

            orchestrator = CPROIOrchestrator()  # No stream_manager
            result = await orchestrator.run(
                "Nike", "retail", "experience-transformation-design"
            )

            assert isinstance(result, dict)
            assert "case_id" in result
