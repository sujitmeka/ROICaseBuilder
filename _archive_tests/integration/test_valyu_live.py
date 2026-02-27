"""Live integration tests for ValyuProvider -- requires VALYU_API_KEY."""

import os

import pytest

from backend.config.settings import Settings
from backend.providers.valyu_provider import ValyuProvider

pytestmark = pytest.mark.integration

VALYU_API_KEY = os.getenv("VALYU_API_KEY", "")


@pytest.mark.skipif(not VALYU_API_KEY, reason="VALYU_API_KEY not set")
class TestValyuLive:

    @pytest.mark.asyncio
    async def test_fetch_apple_revenue(self):
        settings = Settings(valyu_api_key=VALYU_API_KEY)
        provider = ValyuProvider(settings=settings)
        data = await provider.fetch("Apple", "retail")

        assert data.annual_revenue is not None
        assert data.annual_revenue.value > 300_000_000_000

    @pytest.mark.asyncio
    async def test_fetch_nike_revenue(self):
        settings = Settings(valyu_api_key=VALYU_API_KEY)
        provider = ValyuProvider(settings=settings)
        data = await provider.fetch("Nike", "retail")

        assert data.annual_revenue is not None
        assert data.annual_revenue.value > 40_000_000_000
