"""Valyu provider -- fetches public company financials from SEC filings
via the Valyu.ai unified search API."""

from __future__ import annotations

import logging
import re
from typing import Any, Optional

from valyu import Valyu

from backend.config.settings import Settings
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType

from .base import ProviderBase

logger = logging.getLogger(__name__)


# Maps CompanyData field names to Valyu query templates.
FIELD_QUERY_MAP: dict[str, dict[str, Any]] = {
    "annual_revenue": {
        "query": "What is {company}'s total annual revenue from their latest SEC filing?",
        "source_type": DataSourceType.VALYU_SEC_FILING,
    },
    "net_income": {
        "query": "What is {company}'s net income from their latest SEC filing?",
        "source_type": DataSourceType.VALYU_SEC_FILING,
    },
    "gross_margin": {
        "query": "What is {company}'s gross margin percentage?",
        "source_type": DataSourceType.VALYU_FINANCIAL_METRICS,
    },
    "operating_margin": {
        "query": "What is {company}'s operating margin percentage?",
        "source_type": DataSourceType.VALYU_FINANCIAL_METRICS,
    },
    "revenue_growth_yoy": {
        "query": "What is {company}'s year-over-year revenue growth rate?",
        "source_type": DataSourceType.VALYU_INCOME_STATEMENT,
    },
    "online_revenue": {
        "query": "What is {company}'s online or digital revenue?",
        "source_type": DataSourceType.VALYU_SEC_FILING,
    },
}


class ValyuProvider(ProviderBase):
    """Fetches public company financial data via Valyu.ai API."""

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self._client = Valyu(api_key=self._settings.valyu_api_key)

    async def health_check(self) -> bool:
        try:
            response = self._client.search(
                query="Apple revenue",
                search_type="all",
                num_results=1,
            )
            return bool(response and getattr(response, "results", None) is not None)
        except Exception as e:
            logger.error(f"Valyu health check failed: {e}")
            return False

    async def fetch(self, company_name: str, industry: str) -> CompanyData:
        company_data = CompanyData(company_name=company_name, industry=industry)
        data_gaps: list[str] = []

        for field_name, config in FIELD_QUERY_MAP.items():
            query_text = config["query"].format(company=company_name)
            try:
                response = self._client.search(
                    query=query_text,
                    search_type="all",
                    num_results=5,
                )

                results = getattr(response, "results", None) or []
                if not results:
                    logger.warning(f"Valyu returned no results for '{field_name}'")
                    data_gaps.append(field_name)
                    continue

                top_result = results[0]
                content = getattr(top_result, "content", "") or getattr(top_result, "text", "") or ""
                raw_value = content

                numeric_value = _parse_numeric(str(content))
                if numeric_value is None:
                    data_gaps.append(field_name)
                    continue

                source = SourceAttribution(
                    source_type=config["source_type"],
                    source_url=getattr(top_result, "url", None),
                    source_label=getattr(top_result, "title", ""),
                    api_query=query_text,
                    raw_value=raw_value,
                    relevance_score=getattr(top_result, "relevance_score", None),
                )

                dp = DataPoint(
                    value=numeric_value,
                    confidence_tier=DataSourceTier.COMPANY_REPORTED,
                    confidence_score=0.90,
                    source=source,
                )
                setattr(company_data, field_name, dp)

            except Exception as e:
                logger.error(f"Valyu query failed for {field_name}: {e}")
                data_gaps.append(field_name)

        # Attach data_gaps as an attribute for the orchestrator
        company_data._data_gaps = data_gaps
        return company_data


def _parse_numeric(text: str) -> Optional[float]:
    """Parse a financial string into a numeric value.

    Handles:
      - "$51.2 billion" -> 51_200_000_000
      - "$340.5 million" -> 340_500_000
      - "$2.8 trillion" -> 2_800_000_000_000
      - "45.3%" -> 0.453
      - "-5.2%" -> -0.052
      - "51200000000" -> 51_200_000_000.0
      - "N/A", "not available" -> None
    """
    if not text or not isinstance(text, str):
        return None

    text = text.strip()

    # Reject garbage values
    lower = text.lower()
    if lower in ("n/a", "na", "not available", "none", "null", "-", ""):
        return None

    # Percentage: "-5.2%" or "45.3%"
    pct_match = re.search(r"(-?\d+\.?\d*)\s*%", text)
    if pct_match:
        return float(pct_match.group(1)) / 100.0

    # Dollar amounts with word multipliers: "$51.2 billion"
    multipliers = {
        "trillion": 1_000_000_000_000,
        "billion": 1_000_000_000,
        "million": 1_000_000,
        "thousand": 1_000,
    }
    money_match = re.search(
        r"\$?\s*(-?\d[\d,]*\.?\d*)\s*(trillion|billion|million|thousand)",
        text,
        re.IGNORECASE,
    )
    if money_match:
        value = float(money_match.group(1).replace(",", ""))
        suffix = money_match.group(2).lower()
        return value * multipliers[suffix]

    # Plain number (possibly with commas or dollar sign)
    plain_match = re.search(r"(-?\$?\d[\d,]*\.?\d*)", text)
    if plain_match:
        cleaned = plain_match.group(1).replace("$", "").replace(",", "")
        try:
            return float(cleaned)
        except ValueError:
            return None

    return None
