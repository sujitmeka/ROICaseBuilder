"""Firecrawl provider -- scrapes Crunchbase for private company data."""

from __future__ import annotations

import asyncio
import logging
import re
from typing import Any, Optional

from firecrawl import FirecrawlApp
from pydantic import BaseModel, Field

from backend.config.settings import Settings
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType

from .base import ProviderBase

logger = logging.getLogger(__name__)


class CrunchbaseExtraction(BaseModel):
    """Schema for Firecrawl to extract from Crunchbase pages."""

    company_name: Optional[str] = Field(None, description="Official company name")
    total_funding: Optional[str] = Field(None, description="Total funding amount")
    estimated_revenue: Optional[str] = Field(None, description="Estimated annual revenue")
    employee_count: Optional[str] = Field(None, description="Number of employees")
    headquarters: Optional[str] = Field(None, description="HQ location")
    founded_date: Optional[str] = Field(None, description="Year founded")
    estimated_valuation: Optional[str] = Field(None, description="Estimated valuation")


class FirecrawlProvider(ProviderBase):
    """Fetches private company data by scraping Crunchbase via Firecrawl."""

    CRUNCHBASE_URL = "https://www.crunchbase.com/organization/{slug}"

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self._app = FirecrawlApp(api_key=self._settings.firecrawl_api_key)

    async def health_check(self) -> bool:
        try:
            result = await asyncio.to_thread(
                self._app.scrape_url,
                "https://www.crunchbase.com",
                params={"formats": ["markdown"]},
            )
            return result is not None
        except Exception as e:
            logger.error(f"Firecrawl health check failed: {e}")
            return False

    async def fetch(self, company_name: str, industry: str) -> CompanyData:
        company_data = CompanyData(company_name=company_name, industry=industry)
        slug = self._name_to_slug(company_name)
        url = self.CRUNCHBASE_URL.format(slug=slug)

        try:
            result = await asyncio.to_thread(
                self._app.scrape_url,
                url,
                params={
                    "formats": ["extract"],
                    "extract": {
                        "prompt": (
                            f"Extract all available company information for "
                            f"'{company_name}' from this Crunchbase page."
                        ),
                        "schema": CrunchbaseExtraction.model_json_schema(),
                    },
                },
            )

            extract_data = None
            if result and isinstance(result, dict) and "extract" in result:
                extract_data = result["extract"]
            elif result and hasattr(result, "extract"):
                extract_data = result.extract

            if extract_data is None:
                company_data._data_gaps = ["annual_revenue", "total_funding"]
                return company_data

            if isinstance(extract_data, dict):
                cb = CrunchbaseExtraction(**extract_data)
            else:
                cb = extract_data

            self._map_to_company_data(cb, company_data, url)

        except Exception as e:
            logger.error(f"Firecrawl scrape failed for {company_name}: {e}")
            company_data._data_gaps = ["annual_revenue", "total_funding"]

        return company_data

    def _name_to_slug(self, name: str) -> str:
        slug = name.lower().strip()
        slug = re.sub(r"[^a-z0-9\s-]", "", slug)
        slug = re.sub(r"\s+", "-", slug)
        return slug

    def _map_to_company_data(
        self, cb: CrunchbaseExtraction, company_data: CompanyData, url: str
    ) -> None:
        def make_source(label: str) -> SourceAttribution:
            return SourceAttribution(
                source_type=DataSourceType.FIRECRAWL_CRUNCHBASE,
                source_url=url,
                source_label=f"Crunchbase: {label}",
            )

        if cb.estimated_revenue:
            parsed = self._parse_money(cb.estimated_revenue)
            if parsed is not None:
                company_data.annual_revenue = DataPoint(
                    value=parsed,
                    confidence_tier=DataSourceTier.ESTIMATED,
                    confidence_score=0.50,
                    source=make_source("Estimated Revenue"),
                    notes=f"Raw: '{cb.estimated_revenue}'",
                )

        if cb.total_funding:
            parsed = self._parse_money(cb.total_funding)
            if parsed is not None:
                company_data.total_funding = DataPoint(
                    value=parsed,
                    confidence_tier=DataSourceTier.ESTIMATED,
                    confidence_score=0.70,
                    source=make_source("Total Funding"),
                    notes=f"Raw: '{cb.total_funding}'",
                )

        if cb.estimated_valuation:
            parsed = self._parse_money(cb.estimated_valuation)
            if parsed is not None:
                company_data.estimated_valuation = DataPoint(
                    value=parsed,
                    confidence_tier=DataSourceTier.ESTIMATED,
                    confidence_score=0.50,
                    source=make_source("Estimated Valuation"),
                )

        gaps = []
        if company_data.annual_revenue is None:
            gaps.append("annual_revenue")
        if company_data.total_funding is None:
            gaps.append("total_funding")
        company_data._data_gaps = gaps

    def _parse_money(self, text: str) -> Optional[float]:
        if not text:
            return None
        multipliers = {
            "trillion": 1_000_000_000_000,
            "billion": 1_000_000_000,
            "million": 1_000_000,
            "thousand": 1_000,
        }
        match = re.search(
            r"\$?\s*(-?\d[\d,]*\.?\d*)\s*(trillion|billion|million|thousand)?",
            text,
            re.IGNORECASE,
        )
        if match:
            value = float(match.group(1).replace(",", ""))
            suffix = match.group(2)
            if suffix:
                value *= multipliers[suffix.lower()]
            return value
        return None
