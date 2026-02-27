from __future__ import annotations

from abc import ABC, abstractmethod

from backend.models.company_data import CompanyData


class ProviderBase(ABC):
    """Abstract base for all data providers."""

    @abstractmethod
    async def fetch(self, company_name: str, industry: str) -> CompanyData:
        """Fetch data and return a partially-populated CompanyData."""
        ...

    @abstractmethod
    async def health_check(self) -> bool:
        """Verify the provider API is reachable and authenticated."""
        ...
