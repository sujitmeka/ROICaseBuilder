"""Tests for WebSearchProvider -- all mocked, no API keys needed."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.models.enums import DataSourceTier
from backend.providers.websearch_provider import WebSearchProvider


class TestWebSearchProvider:

    @pytest.mark.asyncio
    async def test_fetches_benchmark_data(self):
        with patch("backend.providers.websearch_provider.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {
                "web": {
                    "results": [
                        {"description": "The average ecommerce conversion rate is 2.5% in 2024."},
                        {"description": "Retail conversion rates average around 3.1% globally."},
                    ]
                }
            }
            mock_client.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value = mock_client

            provider = WebSearchProvider()
            provider._client = mock_client
            data = await provider.fetch("AcmeCorp", "retail")

            assert data.current_conversion_rate is not None
            assert data.current_conversion_rate.value == pytest.approx(0.025)
            assert data.current_conversion_rate.confidence_tier == DataSourceTier.INDUSTRY_BENCHMARK

    @pytest.mark.asyncio
    async def test_handles_empty_results(self):
        with patch("backend.providers.websearch_provider.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_resp = MagicMock()
            mock_resp.status_code = 200
            mock_resp.json.return_value = {"web": {"results": []}}
            mock_client.get = AsyncMock(return_value=mock_resp)
            MockClient.return_value = mock_client

            provider = WebSearchProvider()
            provider._client = mock_client
            data = await provider.fetch("AcmeCorp", "retail")

            # Should not crash, gaps recorded
            assert hasattr(data, "_data_gaps")

    @pytest.mark.asyncio
    async def test_handles_api_failure(self):
        with patch("backend.providers.websearch_provider.httpx.AsyncClient") as MockClient:
            mock_client = AsyncMock()
            mock_client.get = AsyncMock(side_effect=Exception("Network error"))
            MockClient.return_value = mock_client

            provider = WebSearchProvider()
            provider._client = mock_client
            data = await provider.fetch("AcmeCorp", "retail")

            # Should not crash
            assert data.company_name == "AcmeCorp"
