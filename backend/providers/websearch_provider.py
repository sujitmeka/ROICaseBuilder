"""WebSearch provider -- fetches industry benchmarks via web search."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

import httpx

from backend.config.settings import Settings
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType

from .base import ProviderBase

logger = logging.getLogger(__name__)


# Industry benchmark queries for key CX metrics.
BENCHMARK_QUERIES: dict[str, dict[str, Any]] = {
    "current_conversion_rate": {
        "query": "{industry} ecommerce average conversion rate 2024",
        "parse_type": "percentage",
    },
    "current_aov": {
        "query": "{industry} average order value 2024",
        "parse_type": "dollar",
    },
    "current_churn_rate": {
        "query": "{industry} average customer churn rate 2024",
        "parse_type": "percentage",
    },
    "current_nps": {
        "query": "{industry} average NPS score net promoter score 2024",
        "parse_type": "number",
    },
    "customer_lifetime_value": {
        "query": "{industry} average customer lifetime value CLV 2024",
        "parse_type": "dollar",
    },
    "cost_per_contact": {
        "query": "{industry} average cost per customer support contact 2024",
        "parse_type": "dollar",
    },
}


class WebSearchProvider(ProviderBase):
    """Fetches industry benchmark data via web search."""

    SEARCH_URL = "https://api.search.brave.com/res/v1/web/search"

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self._client = httpx.AsyncClient(timeout=30.0)

    async def health_check(self) -> bool:
        try:
            resp = await self._client.get("https://www.google.com", follow_redirects=True)
            return resp.status_code == 200
        except Exception as e:
            logger.error(f"WebSearch health check failed: {e}")
            return False

    async def fetch(self, company_name: str, industry: str) -> CompanyData:
        company_data = CompanyData(company_name=company_name, industry=industry)
        data_gaps: list[str] = []

        for field_name, config in BENCHMARK_QUERIES.items():
            query_text = config["query"].format(industry=industry)
            try:
                results = await self._search(query_text)
                if not results:
                    data_gaps.append(field_name)
                    continue

                value = self._parse_result(results, config["parse_type"])
                if value is None:
                    data_gaps.append(field_name)
                    continue

                source = SourceAttribution(
                    source_type=DataSourceType.WEBSEARCH_BENCHMARK,
                    source_label=f"Web search: {query_text}",
                    api_query=query_text,
                )

                dp = DataPoint(
                    value=value,
                    confidence_tier=DataSourceTier.INDUSTRY_BENCHMARK,
                    confidence_score=0.70,
                    source=source,
                    notes=f"Industry benchmark for {industry}",
                )
                setattr(company_data, field_name, dp)

            except Exception as e:
                logger.error(f"WebSearch failed for {field_name}: {e}")
                data_gaps.append(field_name)

        company_data._data_gaps = data_gaps
        return company_data

    async def _search(self, query: str) -> list[str]:
        """Perform a web search and return snippet texts."""
        try:
            resp = await self._client.get(
                self.SEARCH_URL,
                params={"q": query, "count": 5},
                headers={"Accept": "application/json"},
            )
            if resp.status_code != 200:
                return []
            data = resp.json()
            results = data.get("web", {}).get("results", [])
            return [r.get("description", "") for r in results if r.get("description")]
        except Exception:
            return []

    def _parse_result(self, snippets: list[str], parse_type: str) -> Optional[float]:
        """Extract a numeric value from search result snippets."""
        combined = " ".join(snippets)

        if parse_type == "percentage":
            match = re.search(r"(-?\d+\.?\d*)\s*%", combined)
            if match:
                return float(match.group(1)) / 100.0

        elif parse_type == "dollar":
            match = re.search(r"\$\s*(\d[\d,]*\.?\d*)", combined)
            if match:
                return float(match.group(1).replace(",", ""))

        elif parse_type == "number":
            match = re.search(r"(\d+\.?\d*)", combined)
            if match:
                return float(match.group(1))

        return None
