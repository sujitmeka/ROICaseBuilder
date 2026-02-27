"""Tests for FirecrawlProvider -- all mocked, no API keys needed."""

import pytest
from unittest.mock import patch, MagicMock

from backend.models.enums import DataSourceTier
from backend.providers.firecrawl_provider import FirecrawlProvider


class TestFirecrawlProvider:

    @pytest.mark.asyncio
    async def test_extracts_funding_data(self):
        mock_extract = {
            "company_name": "WidgetCo",
            "total_funding": "$150 million",
            "estimated_revenue": "$50 million",
            "employee_count": "500",
            "headquarters": "San Francisco, CA",
            "founded_date": "2015",
            "estimated_valuation": "$500 million",
        }

        with patch("backend.providers.firecrawl_provider.FirecrawlApp") as MockApp:
            mock_app = MagicMock()
            mock_app.scrape_url.return_value = {"extract": mock_extract}
            MockApp.return_value = mock_app

            provider = FirecrawlProvider()
            data = await provider.fetch("WidgetCo", "saas")

            assert data.annual_revenue is not None
            assert data.annual_revenue.value == 50_000_000

    @pytest.mark.asyncio
    async def test_handles_missing_fields_gracefully(self):
        mock_extract = {
            "company_name": "EmptyCo",
            "total_funding": None,
            "estimated_revenue": None,
            "employee_count": None,
            "headquarters": None,
            "founded_date": None,
            "estimated_valuation": None,
        }

        with patch("backend.providers.firecrawl_provider.FirecrawlApp") as MockApp:
            mock_app = MagicMock()
            mock_app.scrape_url.return_value = {"extract": mock_extract}
            MockApp.return_value = mock_app

            provider = FirecrawlProvider()
            data = await provider.fetch("EmptyCo", "saas")

            assert data.annual_revenue is None
            # Should not crash

    @pytest.mark.asyncio
    async def test_sets_estimated_confidence_tier(self):
        mock_extract = {
            "company_name": "WidgetCo",
            "total_funding": "$150 million",
            "estimated_revenue": "$50 million",
            "employee_count": "500",
            "headquarters": "San Francisco, CA",
            "founded_date": "2015",
            "estimated_valuation": None,
        }

        with patch("backend.providers.firecrawl_provider.FirecrawlApp") as MockApp:
            mock_app = MagicMock()
            mock_app.scrape_url.return_value = {"extract": mock_extract}
            MockApp.return_value = mock_app

            provider = FirecrawlProvider()
            data = await provider.fetch("WidgetCo", "saas")

            assert data.annual_revenue is not None
            assert data.annual_revenue.confidence_tier == DataSourceTier.ESTIMATED
