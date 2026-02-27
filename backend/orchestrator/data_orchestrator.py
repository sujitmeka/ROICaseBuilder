"""Data orchestrator -- coordinates providers and merges results."""

from __future__ import annotations

import logging
from typing import Optional

from backend.config.settings import Settings
from backend.models.company_data import CompanyData
from backend.models.enums import CompanyType

from backend.providers.valyu_provider import ValyuProvider
from backend.providers.firecrawl_provider import FirecrawlProvider
from backend.providers.websearch_provider import WebSearchProvider

from .company_classifier import classify_company
from .merge import merge_company_data, ConflictEntry

logger = logging.getLogger(__name__)


class DataOrchestrator:
    """Coordinates data gathering across providers.

    Routes:
    - Public companies -> Valyu first, then WebSearch for gaps.
    - Private companies -> Firecrawl first, then WebSearch for gaps.
    - Merges all results with conflict resolution.
    """

    def __init__(self, settings: Optional[Settings] = None):
        self._settings = settings or Settings()
        self._valyu = ValyuProvider(settings=self._settings)
        self._firecrawl = FirecrawlProvider(settings=self._settings)
        self._websearch = WebSearchProvider(settings=self._settings)

    async def gather(
        self, company_name: str, industry: str
    ) -> tuple[CompanyData, list[ConflictEntry]]:
        """Gather company data from all relevant sources.

        Returns:
            Tuple of (merged CompanyData, list of ConflictEntry objects).
        """
        company_type = classify_company(company_name)
        logger.info(f"Classified '{company_name}' as {company_type.value}")

        primary_data: Optional[CompanyData] = None
        secondary_data: Optional[CompanyData] = None

        if company_type in (CompanyType.PUBLIC, CompanyType.UNKNOWN):
            # Public or unknown -> try Valyu first
            primary_data = await self._valyu.fetch(company_name, industry)
        else:
            # Private -> try Firecrawl first
            primary_data = await self._firecrawl.fetch(company_name, industry)

        # Fill gaps with WebSearch benchmarks
        secondary_data = await self._websearch.fetch(company_name, industry)

        if primary_data is not None and secondary_data is not None:
            merged, conflicts = merge_company_data(primary_data, secondary_data)
        elif primary_data is not None:
            merged = primary_data
            conflicts = []
        elif secondary_data is not None:
            merged = secondary_data
            conflicts = []
        else:
            merged = CompanyData(company_name=company_name, industry=industry)
            conflicts = []

        return merged, conflicts
