from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Optional

from .enums import DataSourceTier, DataSourceType, DataFreshness


@dataclass
class SourceAttribution:
    """Tracks the provenance of every data point."""

    source_type: DataSourceType
    source_url: Optional[str] = None
    source_label: str = ""
    retrieval_timestamp: datetime = field(default_factory=lambda: datetime.now(tz=timezone.utc))
    data_date: Optional[str] = None
    api_query: Optional[str] = None
    api_response_id: Optional[str] = None
    raw_value: Any = None
    relevance_score: Optional[float] = None


@dataclass
class DataPoint:
    """A single data value with full audit metadata."""

    value: Any
    confidence_tier: DataSourceTier
    confidence_score: float
    source: SourceAttribution
    freshness: DataFreshness = DataFreshness.GREEN
    notes: Optional[str] = None
    is_override: bool = False
    override_reason: Optional[str] = None

    @property
    def confidence_multiplier(self) -> float:
        """Returns the discount multiplier for calculations."""
        multipliers = {
            DataSourceTier.COMPANY_REPORTED: 1.0,
            DataSourceTier.INDUSTRY_BENCHMARK: 0.8,
            DataSourceTier.CROSS_INDUSTRY: 0.6,
            DataSourceTier.ESTIMATED: 0.4,
        }
        return multipliers[self.confidence_tier]
