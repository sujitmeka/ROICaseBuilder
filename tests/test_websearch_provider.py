"""Tests for WebSearchProvider -- uses hardcoded industry benchmarks."""

import pytest

from backend.models.enums import DataSourceTier
from backend.providers.websearch_provider import WebSearchProvider, INDUSTRY_DEFAULTS


class TestWebSearchProvider:

    @pytest.mark.asyncio
    async def test_fetches_benchmark_data_for_retail(self):
        provider = WebSearchProvider()
        data = await provider.fetch("AcmeCorp", "retail")

        assert data.current_conversion_rate is not None
        assert data.current_conversion_rate.value == pytest.approx(0.025)
        assert data.current_conversion_rate.confidence_tier == DataSourceTier.INDUSTRY_BENCHMARK

        assert data.current_aov is not None
        assert data.current_aov.value == pytest.approx(160.0)

        assert data.current_churn_rate is not None
        assert data.current_nps is not None
        assert data.customer_lifetime_value is not None
        assert data.cost_per_contact is not None

    @pytest.mark.asyncio
    async def test_fetches_benchmark_data_for_saas(self):
        provider = WebSearchProvider()
        data = await provider.fetch("SaaSCo", "saas-tech")

        assert data.current_conversion_rate.value == pytest.approx(0.03)
        assert data.current_aov.value == pytest.approx(250.0)
        assert data.current_churn_rate.value == pytest.approx(0.05)

    @pytest.mark.asyncio
    async def test_falls_back_to_retail_for_unknown_industry(self):
        provider = WebSearchProvider()
        data = await provider.fetch("UnknownCo", "widgets-manufacturing")

        # Should fall back to retail defaults
        assert data.current_conversion_rate is not None
        assert data.current_conversion_rate.value == pytest.approx(0.025)

    @pytest.mark.asyncio
    async def test_no_data_gaps_for_known_industry(self):
        provider = WebSearchProvider()
        data = await provider.fetch("AcmeCorp", "retail")

        assert hasattr(data, "_data_gaps")
        assert len(data._data_gaps) == 0

    @pytest.mark.asyncio
    async def test_health_check_always_passes(self):
        provider = WebSearchProvider()
        assert await provider.health_check() is True

    @pytest.mark.asyncio
    async def test_all_industries_have_all_fields(self):
        """Every industry in INDUSTRY_DEFAULTS should have all benchmark fields."""
        provider = WebSearchProvider()
        for industry in INDUSTRY_DEFAULTS:
            data = await provider.fetch("TestCo", industry)
            assert data.current_conversion_rate is not None, f"{industry} missing conversion_rate"
            assert data.current_aov is not None, f"{industry} missing aov"
            assert data.current_churn_rate is not None, f"{industry} missing churn_rate"
            assert data.current_nps is not None, f"{industry} missing nps"
            assert data.customer_lifetime_value is not None, f"{industry} missing clv"
            assert data.cost_per_contact is not None, f"{industry} missing cost_per_contact"
