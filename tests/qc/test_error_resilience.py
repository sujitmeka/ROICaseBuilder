"""Tests for error resilience -- providers and tools failing gracefully."""

import json
from unittest.mock import AsyncMock, patch

import pytest

from backend.engine.calculator import CalculationEngine
from backend.methodology.loader import get_default_methodology
from backend.models.company_data import CompanyData
from backend.tools.agent_tools import fetch_financials, scrape_company


class TestErrorResilience:
    """Verify the pipeline handles provider failures gracefully."""

    @pytest.mark.asyncio
    async def test_valyu_timeout_returns_error_response(self):
        """fetch_financials returns error dict when Valyu times out."""
        with patch("backend.tools.agent_tools.ValyuProvider") as MockValyu, \
             patch("backend.tools.agent_tools.FirecrawlProvider") as MockFirecrawl:
            # Valyu raises TimeoutError
            mock_valyu_instance = AsyncMock()
            mock_valyu_instance.fetch = AsyncMock(side_effect=TimeoutError("Valyu timed out"))
            MockValyu.return_value = mock_valyu_instance

            # Firecrawl also fails
            mock_firecrawl_instance = AsyncMock()
            mock_firecrawl_instance.fetch = AsyncMock(side_effect=Exception("Firecrawl failed"))
            MockFirecrawl.return_value = mock_firecrawl_instance

            result = await fetch_financials.handler({"company_name": "TestCo", "industry": "retail"})

            # Should NOT raise -- returns error in content format
            assert "content" in result
            payload = json.loads(result["content"][0]["text"])
            assert "error" in payload
            assert payload["fields"] == {}

    @pytest.mark.asyncio
    async def test_scrape_company_returns_error_on_failure(self):
        """scrape_company returns error dict when Firecrawl fails."""
        with patch("backend.tools.agent_tools.FirecrawlProvider") as MockFirecrawl:
            mock_firecrawl_instance = AsyncMock()
            mock_firecrawl_instance.fetch = AsyncMock(
                side_effect=Exception("Connection refused")
            )
            MockFirecrawl.return_value = mock_firecrawl_instance

            result = await scrape_company.handler({"company_name": "PrivateCo", "industry": "saas"})

            assert "content" in result
            payload = json.loads(result["content"][0]["text"])
            assert "error" in payload
            assert payload["fields"] == {}

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
