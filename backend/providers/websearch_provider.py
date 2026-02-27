"""Industry benchmark provider -- serves hardcoded benchmark defaults.

Uses research-backed industry benchmark data for CX metrics.
In production, this will be enhanced to use Claude's built-in WebSearch
tool via the Agents SDK for real-time data.
"""

from __future__ import annotations

import logging
from typing import Optional

from backend.config.settings import Settings
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType

from .base import ProviderBase

logger = logging.getLogger(__name__)


# Hardcoded industry benchmark defaults (from research/roi-methodology-kpi-research.md)
# These are used as the primary source until Claude Agents SDK web search is wired up.
INDUSTRY_DEFAULTS: dict[str, dict[str, float]] = {
    "retail": {
        "current_conversion_rate": 0.025,
        "current_aov": 160.0,
        "current_churn_rate": 0.25,
        "current_nps": 55.0,
        "customer_lifetime_value": 400.0,
        "cost_per_contact": 8.0,
    },
    "ecommerce-retail": {
        "current_conversion_rate": 0.025,
        "current_aov": 160.0,
        "current_churn_rate": 0.25,
        "current_nps": 55.0,
        "customer_lifetime_value": 400.0,
        "cost_per_contact": 8.0,
    },
    "saas-tech": {
        "current_conversion_rate": 0.03,
        "current_aov": 250.0,
        "current_churn_rate": 0.05,
        "current_nps": 40.0,
        "customer_lifetime_value": 3000.0,
        "cost_per_contact": 12.0,
    },
    "financial-services": {
        "current_conversion_rate": 0.02,
        "current_aov": 500.0,
        "current_churn_rate": 0.15,
        "current_nps": 35.0,
        "customer_lifetime_value": 5000.0,
        "cost_per_contact": 15.0,
    },
    "healthcare": {
        "current_conversion_rate": 0.015,
        "current_aov": 300.0,
        "current_churn_rate": 0.10,
        "current_nps": 38.0,
        "customer_lifetime_value": 2500.0,
        "cost_per_contact": 18.0,
    },
    "telecom": {
        "current_conversion_rate": 0.02,
        "current_aov": 85.0,
        "current_churn_rate": 0.20,
        "current_nps": 30.0,
        "customer_lifetime_value": 1200.0,
        "cost_per_contact": 10.0,
    },
}

# Map field names for benchmark lookup
BENCHMARK_FIELDS = [
    "current_conversion_rate",
    "current_aov",
    "current_churn_rate",
    "current_nps",
    "customer_lifetime_value",
    "cost_per_contact",
]


class WebSearchProvider(ProviderBase):
    """Serves industry benchmark data from research-backed defaults.

    Future: will use Claude Agents SDK WebSearch tool for real-time benchmarks.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()

    async def health_check(self) -> bool:
        return True  # Always available — uses local data

    async def fetch(self, company_name: str, industry: str) -> CompanyData:
        company_data = CompanyData(company_name=company_name, industry=industry)
        data_gaps: list[str] = []

        # Look up defaults for this industry, fall back to retail
        defaults = INDUSTRY_DEFAULTS.get(industry, INDUSTRY_DEFAULTS.get("retail", {}))

        for field_name in BENCHMARK_FIELDS:
            if field_name not in defaults:
                data_gaps.append(field_name)
                continue

            value = defaults[field_name]

            source = SourceAttribution(
                source_type=DataSourceType.WEBSEARCH_BENCHMARK,
                source_label=f"Industry benchmark for {industry}",
            )

            dp = DataPoint(
                value=value,
                confidence_tier=DataSourceTier.INDUSTRY_BENCHMARK,
                confidence_score=0.70,
                source=source,
                notes=f"Research-backed benchmark for {industry}",
            )
            setattr(company_data, field_name, dp)
            logger.info(f"Benchmark for {field_name}: {value}")

        company_data._data_gaps = data_gaps
        return company_data
