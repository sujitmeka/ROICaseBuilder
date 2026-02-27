"""Live integration tests for FirecrawlProvider -- requires FIRECRAWL_API_KEY."""

import os

import pytest

from backend.config.settings import Settings
from backend.providers.firecrawl_provider import FirecrawlProvider

pytestmark = pytest.mark.integration

FIRECRAWL_API_KEY = os.getenv("FIRECRAWL_API_KEY", "")


@pytest.mark.skipif(not FIRECRAWL_API_KEY, reason="FIRECRAWL_API_KEY not set")
class TestFirecrawlLive:

    @pytest.mark.asyncio
    async def test_scrape_crunchbase_company(self):
        settings = Settings(firecrawl_api_key=FIRECRAWL_API_KEY)
        provider = FirecrawlProvider(settings=settings)
        data = await provider.fetch("Stripe", "financial_services")

        # At least one field should be populated
        populated = [
            f for f in ["annual_revenue", "total_funding", "estimated_valuation"]
            if getattr(data, f, None) is not None
        ]
        assert len(populated) >= 1, f"Expected at least one field populated, got: {populated}"
