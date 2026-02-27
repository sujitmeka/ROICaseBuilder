"""Integration tests for the full CPROI pipeline -- end-to-end with mocked providers."""

from unittest.mock import AsyncMock, patch

import pytest

from backend.engine.result import CalculationResult
from backend.models.company_data import CompanyData
from backend.models.enums import Scenario
from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.events import PipelineEventType
from backend.streaming.manager import StreamManager
from tests.conftest import make_dp


def _mock_company_data(name="Nike", industry="retail"):
    """Build a realistic CompanyData for integration tests."""
    from backend.models.enums import DataSourceTier

    return CompanyData(
        company_name=name,
        industry=industry,
        annual_revenue=make_dp(51_200_000_000),
        online_revenue=make_dp(21_500_000_000),
        current_conversion_rate=make_dp(0.025, DataSourceTier.INDUSTRY_BENCHMARK, 0.80),
        current_aov=make_dp(160, DataSourceTier.ESTIMATED, 0.50),
        order_volume=make_dp(50_000_000, DataSourceTier.ESTIMATED, 0.50),
        current_churn_rate=make_dp(0.25, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        customer_count=make_dp(1_250_000, DataSourceTier.ESTIMATED, 0.50),
        revenue_per_customer=make_dp(400, DataSourceTier.ESTIMATED, 0.50),
        current_support_contacts=make_dp(2_000_000, DataSourceTier.ESTIMATED, 0.40),
        cost_per_contact=make_dp(8, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        current_nps=make_dp(55, DataSourceTier.INDUSTRY_BENCHMARK, 0.75),
        engagement_cost=make_dp(2_000_000),
    )


@pytest.mark.integration
class TestFullPipeline:
    """End-to-end pipeline tests with mocked data providers."""

    @pytest.mark.asyncio
    async def test_orchestrator_returns_calculation_result(self):
        """CPROIOrchestrator.run() returns a CalculationResult with 3 scenarios."""
        with patch(
            "backend.orchestrator.agent.DataOrchestrator"
        ) as MockDataOrch:
            mock_instance = AsyncMock()
            mock_instance.gather = AsyncMock(
                return_value=(_mock_company_data(), [])
            )
            MockDataOrch.return_value = mock_instance

            orchestrator = CPROIOrchestrator()
            result = await orchestrator.run(
                "Nike", "retail", "experience-transformation-design"
            )

            assert isinstance(result, CalculationResult)
            assert len(result.scenarios) == 3
            assert Scenario.CONSERVATIVE in result.scenarios
            assert Scenario.MODERATE in result.scenarios
            assert Scenario.AGGRESSIVE in result.scenarios

    @pytest.mark.asyncio
    async def test_orchestrator_emits_sse_events(self):
        """After run(), the StreamManager buffer has PIPELINE_STARTED and CALCULATION_COMPLETED."""
        with patch(
            "backend.orchestrator.agent.DataOrchestrator"
        ) as MockDataOrch:
            mock_instance = AsyncMock()
            mock_instance.gather = AsyncMock(
                return_value=(_mock_company_data(), [])
            )
            MockDataOrch.return_value = mock_instance

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
            assert PipelineEventType.CALCULATION_COMPLETED in event_types, (
                f"CALCULATION_COMPLETED not found in {event_types}"
            )

    @pytest.mark.asyncio
    async def test_orchestrator_handles_provider_failure(self):
        """run() completes even when the primary provider (Valyu) fails."""
        with patch(
            "backend.orchestrator.agent.DataOrchestrator"
        ) as MockDataOrch:
            # Simulate partial data (provider failure means sparse data)
            sparse_data = CompanyData(
                company_name="Nike",
                industry="retail",
                annual_revenue=make_dp(51_200_000_000),
                engagement_cost=make_dp(2_000_000),
            )
            mock_instance = AsyncMock()
            mock_instance.gather = AsyncMock(
                return_value=(sparse_data, [])
            )
            MockDataOrch.return_value = mock_instance

            orchestrator = CPROIOrchestrator()
            result = await orchestrator.run(
                "Nike", "retail", "experience-transformation-design"
            )

            # Should still return a valid result with some skipped KPIs
            assert isinstance(result, CalculationResult)
            assert result.company_name == "Nike"
            # Most KPIs should be skipped due to missing data
            moderate = result.scenarios[Scenario.MODERATE]
            assert len(moderate.skipped_kpis) > 0
