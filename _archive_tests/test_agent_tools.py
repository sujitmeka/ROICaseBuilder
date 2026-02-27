"""Tests for SDK-compatible agent tools."""

import json
import pytest
from unittest.mock import patch, AsyncMock

from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType
from backend.tools.agent_tools import (
    fetch_financials,
    scrape_company,
    run_calculation,
    load_methodology,
)


def _make_dp(value, tier=DataSourceTier.COMPANY_REPORTED, score=0.95):
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
    )


class TestFetchFinancials:

    @pytest.mark.asyncio
    async def test_returns_mcp_content_format(self):
        """Tool must return {"content": [{"type": "text", "text": ...}]}"""
        with patch("backend.tools.agent_tools.ValyuProvider") as MockValyu:
            mock_provider = AsyncMock()
            mock_data = CompanyData(company_name="Nike", industry="retail")
            mock_data.annual_revenue = _make_dp(51_200_000_000)
            mock_data._data_gaps = []
            mock_provider.fetch.return_value = mock_data
            MockValyu.return_value = mock_provider

            result = await fetch_financials.handler({"company_name": "Nike", "industry": "retail"})

            assert "content" in result
            assert result["content"][0]["type"] == "text"
            payload = json.loads(result["content"][0]["text"])
            assert "fields" in payload
            assert "annual_revenue" in payload["fields"]

    def test_is_sdk_mcp_tool(self):
        """fetch_financials should be an SdkMcpTool instance."""
        from claude_agent_sdk import SdkMcpTool
        assert isinstance(fetch_financials, SdkMcpTool)
        assert fetch_financials.name == "fetch_financials"

    def test_has_correct_description(self):
        """fetch_financials should describe its purpose."""
        assert "financial" in fetch_financials.description.lower()
        assert "SEC" in fetch_financials.description or "sec" in fetch_financials.description.lower()


class TestScrapeCompany:

    def test_is_sdk_mcp_tool(self):
        """scrape_company should be an SdkMcpTool instance."""
        from claude_agent_sdk import SdkMcpTool
        assert isinstance(scrape_company, SdkMcpTool)
        assert scrape_company.name == "scrape_company"


class TestRunCalculation:

    @pytest.mark.asyncio
    async def test_returns_scenarios(self):
        """run_calculation tool should return 3 scenarios."""
        # Build minimal company_data_dict
        company_data_dict = {
            "company_name": "Acme",
            "industry": "retail",
            "fields": {
                "online_revenue": {"value": 200_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "annual_revenue": {"value": 500_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
            }
        }
        result = await run_calculation.handler({
            "company_data": company_data_dict,
            "service_type": "experience-transformation-design",
        })

        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert "scenarios" in payload
        assert "conservative" in payload["scenarios"]
        assert "moderate" in payload["scenarios"]
        assert "aggressive" in payload["scenarios"]

    def test_is_sdk_mcp_tool(self):
        """run_calculation should be an SdkMcpTool instance."""
        from claude_agent_sdk import SdkMcpTool
        assert isinstance(run_calculation, SdkMcpTool)
        assert run_calculation.name == "run_calculation"


class TestLoadMethodology:

    @pytest.mark.asyncio
    async def test_returns_kpi_list(self):
        """load_methodology should return methodology with KPI details."""
        result = await load_methodology.handler({
            "service_type": "experience-transformation-design",
        })

        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert "kpis" in payload
        assert len(payload["kpis"]) >= 5
        # Each KPI should list its required inputs
        for kpi in payload["kpis"]:
            assert "id" in kpi
            assert "inputs" in kpi

    def test_is_sdk_mcp_tool(self):
        """load_methodology should be an SdkMcpTool instance."""
        from claude_agent_sdk import SdkMcpTool
        assert isinstance(load_methodology, SdkMcpTool)
        assert load_methodology.name == "load_methodology"
