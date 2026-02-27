"""Tests for ValyuProvider -- all mocked, no API keys needed."""

import pytest
from unittest.mock import patch, MagicMock

from backend.models.enums import DataSourceTier
from backend.providers.valyu_provider import ValyuProvider, _parse_numeric


# ---------------------------------------------------------------------------
# Parsing tests
# ---------------------------------------------------------------------------

class TestValyuProviderParsing:

    def test_parse_billion_dollar_amount(self):
        assert _parse_numeric("$51.2 billion") == 51_200_000_000

    def test_parse_million_dollar_amount(self):
        assert _parse_numeric("$340.5 million") == 340_500_000

    def test_parse_percentage(self):
        assert _parse_numeric("2.5%") == pytest.approx(0.025)

    def test_parse_plain_number(self):
        assert _parse_numeric("51200000000") == 51_200_000_000

    def test_parse_returns_none_for_garbage(self):
        assert _parse_numeric("N/A") is None
        assert _parse_numeric("not available") is None

    def test_parse_negative_percentage(self):
        assert _parse_numeric("-5.2%") == pytest.approx(-0.052)

    def test_parse_trillion(self):
        assert _parse_numeric("$2.8 trillion") == 2_800_000_000_000


# ---------------------------------------------------------------------------
# Fetch tests (mocked Valyu client)
# ---------------------------------------------------------------------------

def _make_mock_result(content: str, url: str = "https://sec.gov/doc", title: str = "SEC Filing"):
    """Create a mock Valyu search result."""
    result = MagicMock()
    result.content = content
    result.text = content
    result.url = url
    result.title = title
    result.relevance_score = 0.95
    return result


def _make_mock_response(results=None, success=True):
    """Create a mock Valyu search response."""
    resp = MagicMock()
    resp.results = results or []
    resp.success = success
    resp.tx_id = "mock-tx-123"
    return resp


class TestValyuProviderFetch:

    @pytest.mark.asyncio
    async def test_successful_fetch(self):
        mock_result = _make_mock_result("Apple's total annual revenue was $383.3 billion")
        mock_response = _make_mock_response(results=[mock_result])

        with patch("backend.providers.valyu_provider.Valyu") as MockValyu:
            mock_client = MagicMock()
            mock_client.search.return_value = mock_response
            MockValyu.return_value = mock_client

            provider = ValyuProvider()
            data = await provider.fetch("Apple", "retail")

            assert data.annual_revenue is not None
            assert data.annual_revenue.value == pytest.approx(383_300_000_000)
            assert data.annual_revenue.confidence_tier == DataSourceTier.COMPANY_REPORTED

    @pytest.mark.asyncio
    async def test_api_failure_records_gap(self):
        with patch("backend.providers.valyu_provider.Valyu") as MockValyu:
            mock_client = MagicMock()
            mock_client.search.side_effect = Exception("API timeout")
            MockValyu.return_value = mock_client

            provider = ValyuProvider()
            data = await provider.fetch("Apple", "retail")

            assert data.annual_revenue is None
            assert "annual_revenue" in data._data_gaps

    @pytest.mark.asyncio
    async def test_no_results_records_gap(self):
        mock_response = _make_mock_response(results=[])

        with patch("backend.providers.valyu_provider.Valyu") as MockValyu:
            mock_client = MagicMock()
            mock_client.search.return_value = mock_response
            MockValyu.return_value = mock_client

            provider = ValyuProvider()
            data = await provider.fetch("Apple", "retail")

            assert data.annual_revenue is None
            assert "annual_revenue" in data._data_gaps
