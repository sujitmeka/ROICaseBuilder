"""Tests for error resilience -- providers failing gracefully."""

from unittest.mock import AsyncMock, patch

import pytest

from backend.engine.calculator import CalculationEngine
from backend.methodology.loader import get_default_methodology
from backend.models.company_data import CompanyData
from backend.orchestrator.data_orchestrator import DataOrchestrator


class TestErrorResilience:
    """Verify the pipeline handles provider failures gracefully."""

    @pytest.mark.asyncio
    async def test_valyu_timeout_doesnt_crash_pipeline(self):
        """DataOrchestrator.gather() does not raise when Valyu times out."""
        with patch(
            "backend.orchestrator.data_orchestrator.ValyuProvider"
        ) as MockValyu, patch(
            "backend.orchestrator.data_orchestrator.FirecrawlProvider"
        ) as MockFirecrawl, patch(
            "backend.orchestrator.data_orchestrator.WebSearchProvider"
        ) as MockWebSearch, patch(
            "backend.orchestrator.data_orchestrator.classify_company"
        ) as mock_classify:
            from backend.models.enums import CompanyType

            mock_classify.return_value = CompanyType.PUBLIC

            # Valyu raises TimeoutError
            mock_valyu_instance = AsyncMock()
            mock_valyu_instance.fetch = AsyncMock(side_effect=TimeoutError("Valyu timed out"))
            MockValyu.return_value = mock_valyu_instance

            # WebSearch returns empty CompanyData
            mock_websearch_instance = AsyncMock()
            mock_websearch_instance.fetch = AsyncMock(
                return_value=CompanyData(company_name="TestCo", industry="retail")
            )
            MockWebSearch.return_value = mock_websearch_instance

            mock_firecrawl_instance = AsyncMock()
            MockFirecrawl.return_value = mock_firecrawl_instance

            orchestrator = DataOrchestrator()
            # Should NOT raise
            merged, conflicts = await orchestrator.gather("TestCo", "retail")
            assert merged is not None
            assert merged.company_name == "TestCo"

    @pytest.mark.asyncio
    async def test_firecrawl_empty_response_graceful(self):
        """DataOrchestrator.gather() completes when Firecrawl returns empty data."""
        with patch(
            "backend.orchestrator.data_orchestrator.ValyuProvider"
        ) as MockValyu, patch(
            "backend.orchestrator.data_orchestrator.FirecrawlProvider"
        ) as MockFirecrawl, patch(
            "backend.orchestrator.data_orchestrator.WebSearchProvider"
        ) as MockWebSearch, patch(
            "backend.orchestrator.data_orchestrator.classify_company"
        ) as mock_classify:
            from backend.models.enums import CompanyType

            mock_classify.return_value = CompanyType.PRIVATE

            # Firecrawl returns empty CompanyData (all None fields)
            mock_firecrawl_instance = AsyncMock()
            mock_firecrawl_instance.fetch = AsyncMock(
                return_value=CompanyData(company_name="PrivateCo", industry="saas")
            )
            MockFirecrawl.return_value = mock_firecrawl_instance

            # WebSearch also returns empty
            mock_websearch_instance = AsyncMock()
            mock_websearch_instance.fetch = AsyncMock(
                return_value=CompanyData(company_name="PrivateCo", industry="saas")
            )
            MockWebSearch.return_value = mock_websearch_instance

            mock_valyu_instance = AsyncMock()
            MockValyu.return_value = mock_valyu_instance

            orchestrator = DataOrchestrator()
            merged, conflicts = await orchestrator.gather("PrivateCo", "saas")
            assert merged is not None
            assert merged.company_name == "PrivateCo"

    def test_pipeline_uses_defaults_when_no_benchmarks(self):
        """CalculationEngine runs even when company data is mostly empty."""
        sparse_data = CompanyData(
            company_name="Empty Corp",
            industry="retail",
        )
        engine = CalculationEngine()
        methodology = get_default_methodology()
        # Should not crash -- KPIs with missing data are skipped
        result = engine.calculate(sparse_data, methodology)
        assert result is not None
        assert result.company_name == "Empty Corp"
        # All KPIs should be skipped since no data is available
        for scenario_result in result.scenarios.values():
            assert len(scenario_result.skipped_kpis) > 0
