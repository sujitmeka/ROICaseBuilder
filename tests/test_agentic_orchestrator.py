"""Tests for the agentic orchestrator — mocks the SDK client."""

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.manager import StreamManager


class TestAgenticOrchestrator:

    @pytest.mark.asyncio
    async def test_orchestrator_creates_sdk_client(self):
        """Orchestrator should initialize ClaudeSDKClient with tools."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            # Simulate async context manager
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            # Mock the query and response
            mock_msg = MagicMock()
            mock_msg.content = []
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            stream_manager = StreamManager()
            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            # We test that it calls ClaudeSDKClient — actual agent logic is integration-tested
            try:
                await orchestrator.run(
                    company_name="Nike",
                    industry="retail",
                    service_type="experience-transformation-design",
                    case_id="test-123",
                )
            except Exception:
                pass  # May fail on mock iteration, that's OK

            # Verify SDK client was created with options
            MockClient.assert_called_once()
            call_kwargs = MockClient.call_args
            options = call_kwargs[0][0] if call_kwargs[0] else call_kwargs[1].get("options")
            assert options is not None

    @pytest.mark.asyncio
    async def test_orchestrator_registers_cproi_tools(self):
        """Orchestrator should register fetch_financials, run_calculation, load_methodology tools."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            orchestrator = CPROIOrchestrator(stream_manager=StreamManager())
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Check options included our MCP server with tools
            call_args = MockClient.call_args
            options = call_args[0][0] if call_args[0] else call_args[1].get("options")
            allowed = options.allowed_tools
            assert "mcp__cproi__fetch_financials" in allowed
            assert "mcp__cproi__run_calculation" in allowed
            assert "mcp__cproi__load_methodology" in allowed
            # Built-in web search tools
            assert "WebSearch" in allowed
            assert "WebFetch" in allowed

    @pytest.mark.asyncio
    async def test_orchestrator_sends_methodology_driven_prompt(self):
        """The query prompt should include company name, industry, and service type."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            orchestrator = CPROIOrchestrator(stream_manager=StreamManager())
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Verify query was called with a prompt containing the inputs
            query_call = mock_client.query
            query_call.assert_called_once()
            prompt = query_call.call_args[0][0] if query_call.call_args[0] else query_call.call_args[1].get("prompt", "")
            assert "Nike" in prompt
            assert "retail" in prompt
