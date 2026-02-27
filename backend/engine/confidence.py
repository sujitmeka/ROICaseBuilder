"""Confidence scoring engine for CPROI data quality assessment."""

from __future__ import annotations

from datetime import datetime

from backend.models.enums import DataSourceTier


def compute_recency_score(data_date: str | None) -> float:
    """Score data freshness based on the year of the data.

    Returns a float between 0.0 and 1.0 indicating how recent the data is.
    """
    if data_date is None:
        return 0.30

    try:
        # Extract year from various date formats (YYYY, YYYY-MM-DD, etc.)
        year = int(data_date[:4])
    except (ValueError, IndexError):
        return 0.30

    current_year = datetime.now().year
    age = current_year - year

    if age < 0:
        # Future date
        return 1.0

    recency_map = {
        0: 1.0,
        1: 0.85,
        2: 0.70,
        3: 0.50,
        4: 0.35,
        5: 0.25,
    }

    return recency_map.get(age, 0.20)


def compute_confidence_score(
    source_quality: float,
    recency: float,
    specificity: float,
    sample_size: float,
) -> float:
    """Compute a weighted composite confidence score.

    Weights: source_quality=0.40, recency=0.25, specificity=0.20, sample_size=0.15
    Result is clamped to [0.0, 1.0].
    """
    raw = (
        source_quality * 0.40
        + recency * 0.25
        + specificity * 0.20
        + sample_size * 0.15
    )
    return max(0.0, min(1.0, raw))


def confidence_tier_from_score(score: float) -> DataSourceTier:
    """Map a numeric confidence score to a DataSourceTier.

    >= 0.85 -> COMPANY_REPORTED
    >= 0.65 -> INDUSTRY_BENCHMARK
    >= 0.45 -> CROSS_INDUSTRY
    <  0.45 -> ESTIMATED
    """
    if score >= 0.85:
        return DataSourceTier.COMPANY_REPORTED
    if score >= 0.65:
        return DataSourceTier.INDUSTRY_BENCHMARK
    if score >= 0.45:
        return DataSourceTier.CROSS_INDUSTRY
    return DataSourceTier.ESTIMATED


def confidence_to_discount(tier: DataSourceTier) -> float:
    """Return the discount multiplier for a given confidence tier.

    COMPANY_REPORTED  -> 1.0  (no discount)
    INDUSTRY_BENCHMARK -> 0.8
    CROSS_INDUSTRY     -> 0.6
    ESTIMATED          -> 0.4
    """
    discounts = {
        DataSourceTier.COMPANY_REPORTED: 1.0,
        DataSourceTier.INDUSTRY_BENCHMARK: 0.8,
        DataSourceTier.CROSS_INDUSTRY: 0.6,
        DataSourceTier.ESTIMATED: 0.4,
    }
    return discounts[tier]
