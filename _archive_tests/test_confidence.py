"""Tests for the confidence scoring engine."""

import pytest

from backend.engine.confidence import (
    compute_recency_score,
    compute_confidence_score,
    confidence_tier_from_score,
    confidence_to_discount,
)
from backend.models.enums import DataSourceTier


class TestRecencyScore:
    def test_current_year_data_scores_1(self):
        # 2026 or 2026-01-15 should score 1.0 (current year)
        assert compute_recency_score("2026") == 1.0
        assert compute_recency_score("2026-01-15") == 1.0

    def test_one_year_old_data(self):
        assert compute_recency_score("2025") == 0.85

    def test_three_year_old_data(self):
        assert compute_recency_score("2023") == 0.50

    def test_six_plus_year_old_data(self):
        assert compute_recency_score("2019") == 0.20

    def test_unknown_date_scores_030(self):
        assert compute_recency_score(None) == 0.30

    def test_future_date_scores_1(self):
        assert compute_recency_score("2027") == 1.0


class TestCompositeConfidence:
    def test_perfect_score(self):
        result = compute_confidence_score(1.0, 1.0, 1.0, 1.0)
        assert result == pytest.approx(1.0)

    def test_tier1_benchmark_recent(self):
        # source_quality=0.9, recency=1.0, specificity=0.8, sample_size=0.7
        result = compute_confidence_score(0.9, 1.0, 0.8, 0.7)
        expected = 0.9 * 0.40 + 1.0 * 0.25 + 0.8 * 0.20 + 0.7 * 0.15
        assert result == pytest.approx(expected)
        assert result == pytest.approx(0.875)

    def test_estimated_cross_industry_old(self):
        # source_quality=0.3, recency=0.25, specificity=0.4, sample_size=0.5
        result = compute_confidence_score(0.3, 0.25, 0.4, 0.5)
        expected = 0.3 * 0.40 + 0.25 * 0.25 + 0.4 * 0.20 + 0.5 * 0.15
        assert result == pytest.approx(expected)
        assert result == pytest.approx(0.3375)

    def test_weights_sum_to_1(self):
        assert 0.40 + 0.25 + 0.20 + 0.15 == pytest.approx(1.0)

    def test_score_clamped_to_unit_interval(self):
        # Inputs > 1.0 should be clamped
        result = compute_confidence_score(2.0, 2.0, 2.0, 2.0)
        assert result == 1.0

        # Inputs < 0.0 should be clamped
        result = compute_confidence_score(-1.0, -1.0, -1.0, -1.0)
        assert result == 0.0


class TestConfidenceDiscount:
    def test_company_reported_no_discount(self):
        assert confidence_to_discount(DataSourceTier.COMPANY_REPORTED) == 1.0

    def test_estimated_60pct_discount(self):
        assert confidence_to_discount(DataSourceTier.ESTIMATED) == 0.4
