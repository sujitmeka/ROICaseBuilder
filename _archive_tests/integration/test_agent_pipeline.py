"""Integration smoke test -- verifies the full pipeline wiring.

Mocks the ClaudeSDKClient but uses real tools, engine, and streaming.
"""

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.manager import StreamManager
from backend.streaming.events import PipelineEventType
from backend.tools.agent_tools import load_methodology, run_calculation


class TestPipelineIntegration:

    @pytest.mark.asyncio
    async def test_tools_produce_valid_output(self):
        """Verify our tools produce valid JSON that the engine can consume."""
        # 1. Load methodology
        method_result = await load_methodology.handler({"service_type": "experience-transformation-design"})
        method_data = json.loads(method_result["content"][0]["text"])
        assert "required_inputs" in method_data
        assert len(method_data["kpis"]) >= 5

        # 2. Build company data as if agent gathered it
        company_data = {
            "company_name": "Test Corp",
            "industry": "retail",
            "fields": {
                "annual_revenue": {"value": 500_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "online_revenue": {"value": 200_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "current_conversion_rate": {"value": 0.025, "confidence_tier": "industry_benchmark", "confidence_score": 0.80},
                "current_aov": {"value": 160.0, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "order_volume": {"value": 1_250_000, "confidence_tier": "estimated", "confidence_score": 0.50},
                "current_churn_rate": {"value": 0.25, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "customer_count": {"value": 1_250_000, "confidence_tier": "estimated", "confidence_score": 0.50},
                "revenue_per_customer": {"value": 400.0, "confidence_tier": "estimated", "confidence_score": 0.50},
                "current_support_contacts": {"value": 2_000_000, "confidence_tier": "estimated", "confidence_score": 0.40},
                "cost_per_contact": {"value": 8.0, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "current_nps": {"value": 55, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
            }
        }

        # 3. Run calculation
        calc_result = await run_calculation.handler({
            "company_data": company_data,
            "service_type": "experience-transformation-design",
        })
        calc_data = json.loads(calc_result["content"][0]["text"])

        assert "scenarios" in calc_data
        moderate = calc_data["scenarios"]["moderate"]
        assert moderate["total_annual_impact"] > 0
        assert len(moderate["kpi_results"]) >= 5
        # No KPIs should be skipped with full data
        skipped = [k for k in moderate["kpi_results"] if k["skipped"]]
        assert len(skipped) == 0

    @pytest.mark.asyncio
    async def test_sse_events_emitted_in_order(self):
        """Verify SSE events fire in the correct order during pipeline run."""

        class _EmptyAsyncIter:
            def __aiter__(self):
                return self
            async def __anext__(self):
                raise StopAsyncIteration

        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = MagicMock(return_value=_EmptyAsyncIter())

            events: list[PipelineEventType] = []
            stream_manager = StreamManager()

            async def capture(case_id, event):
                events.append(event.event_type)

            stream_manager.emit = capture

            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Pipeline should at minimum emit started and completed
            assert PipelineEventType.PIPELINE_STARTED in events
            assert PipelineEventType.PIPELINE_COMPLETED in events
            # Started should come before completed
            assert events.index(PipelineEventType.PIPELINE_STARTED) < events.index(PipelineEventType.PIPELINE_COMPLETED)
