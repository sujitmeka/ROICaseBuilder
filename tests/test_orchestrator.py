"""Tests for DataOrchestrator -- all providers mocked."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import CompanyType, DataSourceTier, DataSourceType
from backend.orchestrator.data_orchestrator import DataOrchestrator


def _make_dp(value, tier, source_type=DataSourceType.VALYU_SEC_FILING, score=0.90):
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=source_type),
    )


def _make_company_data(name, industry, revenue=None, tier=None, source_type=None):
    cd = CompanyData(company_name=name, industry=industry)
    if revenue is not None:
        cd.annual_revenue = _make_dp(revenue, tier, source_type)
    cd._data_gaps = []
    return cd


class TestDataOrchestrator:

    @pytest.mark.asyncio
    async def test_public_company_routes_to_valyu(self):
        valyu_data = _make_company_data(
            "Apple", "retail", 380_000_000_000,
            DataSourceTier.COMPANY_REPORTED, DataSourceType.VALYU_SEC_FILING,
        )
        websearch_data = _make_company_data("Apple", "retail")

        with patch("backend.orchestrator.data_orchestrator.classify_company") as mock_classify, \
             patch("backend.orchestrator.data_orchestrator.ValyuProvider") as MockValyu, \
             patch("backend.orchestrator.data_orchestrator.FirecrawlProvider") as MockFirecrawl, \
             patch("backend.orchestrator.data_orchestrator.WebSearchProvider") as MockWebSearch:

            mock_classify.return_value = CompanyType.PUBLIC

            mock_valyu_inst = AsyncMock()
            mock_valyu_inst.fetch = AsyncMock(return_value=valyu_data)
            MockValyu.return_value = mock_valyu_inst

            mock_firecrawl_inst = AsyncMock()
            mock_firecrawl_inst.fetch = AsyncMock()
            MockFirecrawl.return_value = mock_firecrawl_inst

            mock_websearch_inst = AsyncMock()
            mock_websearch_inst.fetch = AsyncMock(return_value=websearch_data)
            MockWebSearch.return_value = mock_websearch_inst

            orchestrator = DataOrchestrator()
            merged, conflicts = await orchestrator.gather("Apple", "retail")

            mock_valyu_inst.fetch.assert_called_once_with("Apple", "retail")
            mock_firecrawl_inst.fetch.assert_not_called()

    @pytest.mark.asyncio
    async def test_private_company_routes_to_firecrawl(self):
        firecrawl_data = _make_company_data(
            "WidgetCo", "saas", 50_000_000,
            DataSourceTier.ESTIMATED, DataSourceType.FIRECRAWL_CRUNCHBASE,
        )
        websearch_data = _make_company_data("WidgetCo", "saas")

        with patch("backend.orchestrator.data_orchestrator.classify_company") as mock_classify, \
             patch("backend.orchestrator.data_orchestrator.ValyuProvider") as MockValyu, \
             patch("backend.orchestrator.data_orchestrator.FirecrawlProvider") as MockFirecrawl, \
             patch("backend.orchestrator.data_orchestrator.WebSearchProvider") as MockWebSearch:

            mock_classify.return_value = CompanyType.PRIVATE

            mock_valyu_inst = AsyncMock()
            mock_valyu_inst.fetch = AsyncMock()
            MockValyu.return_value = mock_valyu_inst

            mock_firecrawl_inst = AsyncMock()
            mock_firecrawl_inst.fetch = AsyncMock(return_value=firecrawl_data)
            MockFirecrawl.return_value = mock_firecrawl_inst

            mock_websearch_inst = AsyncMock()
            mock_websearch_inst.fetch = AsyncMock(return_value=websearch_data)
            MockWebSearch.return_value = mock_websearch_inst

            orchestrator = DataOrchestrator()
            merged, conflicts = await orchestrator.gather("WidgetCo", "saas")

            mock_firecrawl_inst.fetch.assert_called_once_with("WidgetCo", "saas")
            mock_valyu_inst.fetch.assert_not_called()

    @pytest.mark.asyncio
    async def test_missing_fields_filled_by_websearch(self):
        # Valyu returns revenue but no conversion rate
        valyu_data = _make_company_data(
            "Apple", "retail", 380_000_000_000,
            DataSourceTier.COMPANY_REPORTED, DataSourceType.VALYU_SEC_FILING,
        )

        # WebSearch fills conversion rate
        websearch_data = CompanyData(company_name="Apple", industry="retail")
        websearch_data.current_conversion_rate = _make_dp(
            0.025, DataSourceTier.INDUSTRY_BENCHMARK, DataSourceType.WEBSEARCH_BENCHMARK,
        )
        websearch_data._data_gaps = []

        with patch("backend.orchestrator.data_orchestrator.classify_company") as mock_classify, \
             patch("backend.orchestrator.data_orchestrator.ValyuProvider") as MockValyu, \
             patch("backend.orchestrator.data_orchestrator.FirecrawlProvider") as MockFirecrawl, \
             patch("backend.orchestrator.data_orchestrator.WebSearchProvider") as MockWebSearch:

            mock_classify.return_value = CompanyType.PUBLIC

            mock_valyu_inst = AsyncMock()
            mock_valyu_inst.fetch = AsyncMock(return_value=valyu_data)
            MockValyu.return_value = mock_valyu_inst

            mock_firecrawl_inst = AsyncMock()
            MockFirecrawl.return_value = mock_firecrawl_inst

            mock_websearch_inst = AsyncMock()
            mock_websearch_inst.fetch = AsyncMock(return_value=websearch_data)
            MockWebSearch.return_value = mock_websearch_inst

            orchestrator = DataOrchestrator()
            merged, conflicts = await orchestrator.gather("Apple", "retail")

            # Revenue from Valyu, conversion rate from WebSearch
            assert merged.annual_revenue is not None
            assert merged.current_conversion_rate is not None
            assert merged.current_conversion_rate.value == pytest.approx(0.025)

    @pytest.mark.asyncio
    async def test_returns_populated_company_data(self):
        valyu_data = _make_company_data(
            "Nike", "retail", 51_200_000_000,
            DataSourceTier.COMPANY_REPORTED, DataSourceType.VALYU_SEC_FILING,
        )
        websearch_data = _make_company_data("Nike", "retail")

        with patch("backend.orchestrator.data_orchestrator.classify_company") as mock_classify, \
             patch("backend.orchestrator.data_orchestrator.ValyuProvider") as MockValyu, \
             patch("backend.orchestrator.data_orchestrator.FirecrawlProvider") as MockFirecrawl, \
             patch("backend.orchestrator.data_orchestrator.WebSearchProvider") as MockWebSearch:

            mock_classify.return_value = CompanyType.PUBLIC

            mock_valyu_inst = AsyncMock()
            mock_valyu_inst.fetch = AsyncMock(return_value=valyu_data)
            MockValyu.return_value = mock_valyu_inst

            mock_firecrawl_inst = AsyncMock()
            MockFirecrawl.return_value = mock_firecrawl_inst

            mock_websearch_inst = AsyncMock()
            mock_websearch_inst.fetch = AsyncMock(return_value=websearch_data)
            MockWebSearch.return_value = mock_websearch_inst

            orchestrator = DataOrchestrator()
            merged, conflicts = await orchestrator.gather("Nike", "retail")

            assert merged.annual_revenue is not None
            assert merged.annual_revenue.value == 51_200_000_000
