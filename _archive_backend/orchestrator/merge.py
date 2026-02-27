"""Merge multiple CompanyData objects with conflict resolution."""

from __future__ import annotations

from dataclasses import fields
from typing import Any, Optional

from backend.models.audit import DataPoint
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier


# Confidence tier ordering: higher index = higher confidence.
_TIER_RANK = {
    DataSourceTier.ESTIMATED: 0,
    DataSourceTier.CROSS_INDUSTRY: 1,
    DataSourceTier.INDUSTRY_BENCHMARK: 2,
    DataSourceTier.COMPANY_REPORTED: 3,
}


class ConflictEntry:
    """Records a conflict between two data sources for a field."""

    def __init__(
        self,
        field_name: str,
        primary_value: Any,
        primary_source: str,
        primary_tier: DataSourceTier,
        secondary_value: Any,
        secondary_source: str,
        secondary_tier: DataSourceTier,
        resolution: str,
        chosen_value: Any,
        flagged_for_cp: bool = False,
    ):
        self.field_name = field_name
        self.primary_value = primary_value
        self.primary_source = primary_source
        self.primary_tier = primary_tier
        self.secondary_value = secondary_value
        self.secondary_source = secondary_source
        self.secondary_tier = secondary_tier
        self.resolution = resolution
        self.chosen_value = chosen_value
        self.flagged_for_cp = flagged_for_cp


def _discrepancy_pct(a: float, b: float) -> float:
    """Calculate the percentage discrepancy between two numeric values."""
    if a == 0 and b == 0:
        return 0.0
    denom = max(abs(a), abs(b))
    if denom == 0:
        return 0.0
    return abs(a - b) / denom


def _pick_winner(dp_a: DataPoint, dp_b: DataPoint) -> DataPoint:
    """Return the DataPoint with the higher confidence tier."""
    if _TIER_RANK[dp_a.confidence_tier] >= _TIER_RANK[dp_b.confidence_tier]:
        return dp_a
    return dp_b


def merge_company_data(
    primary: CompanyData,
    *secondaries: CompanyData,
) -> tuple[CompanyData, list[ConflictEntry]]:
    """Merge multiple CompanyData objects into one.

    Rules:
    - Higher confidence tier wins.
    - >10% discrepancy between numeric values -> flag for CP review.
    - <10% discrepancy -> take higher confidence, log but don't flag.
    - Maintains audit trail of all conflicts.

    Returns:
        Tuple of (merged CompanyData, list of ConflictEntry objects).
    """
    merged = CompanyData(
        company_name=primary.company_name,
        industry=primary.industry,
    )
    conflicts: list[ConflictEntry] = []

    # Collect all DataPoint fields
    data_field_names = [
        f.name
        for f in fields(CompanyData)
        if f.name not in CompanyData._NON_DATA_FIELDS
    ]

    # Start with primary values
    for fname in data_field_names:
        val = getattr(primary, fname, None)
        if val is not None:
            setattr(merged, fname, val)

    # Merge each secondary
    for secondary in secondaries:
        for fname in data_field_names:
            sec_dp = getattr(secondary, fname, None)
            if sec_dp is None:
                continue

            existing_dp = getattr(merged, fname, None)
            if existing_dp is None:
                # No conflict -- just fill the gap
                setattr(merged, fname, sec_dp)
                continue

            # Both have values -- resolve conflict
            winner = _pick_winner(existing_dp, sec_dp)
            loser = sec_dp if winner is existing_dp else existing_dp

            # Check numeric discrepancy
            flagged = False
            try:
                v1 = float(existing_dp.value)
                v2 = float(sec_dp.value)
                disc = _discrepancy_pct(v1, v2)
                if disc > 0.10:
                    flagged = True
            except (TypeError, ValueError):
                pass

            resolution = (
                f"Chose {winner.confidence_tier.value} "
                f"(rank {_TIER_RANK[winner.confidence_tier]}) over "
                f"{loser.confidence_tier.value} "
                f"(rank {_TIER_RANK[loser.confidence_tier]})"
            )

            conflict = ConflictEntry(
                field_name=fname,
                primary_value=existing_dp.value,
                primary_source=existing_dp.source.source_type.value,
                primary_tier=existing_dp.confidence_tier,
                secondary_value=sec_dp.value,
                secondary_source=sec_dp.source.source_type.value,
                secondary_tier=sec_dp.confidence_tier,
                resolution=resolution,
                chosen_value=winner.value,
                flagged_for_cp=flagged,
            )
            conflicts.append(conflict)
            setattr(merged, fname, winner)

    return merged, conflicts
