"""Tests for merge_company_data."""

import pytest

from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType
from backend.orchestrator.merge import merge_company_data


def _make_dp(value, tier, source_type=DataSourceType.VALYU_SEC_FILING, score=0.90):
    """Create a DataPoint for testing."""
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=source_type),
    )


class TestMerge:

    def test_sec_filing_beats_news_article(self):
        primary = CompanyData(
            company_name="Apple",
            industry="retail",
            annual_revenue=_make_dp(
                380_000_000_000,
                DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="Apple",
            industry="retail",
            annual_revenue=_make_dp(
                375_000_000_000,
                DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )

        merged, conflicts = merge_company_data(primary, secondary)

        assert merged.annual_revenue is not None
        assert merged.annual_revenue.value == 380_000_000_000
        assert merged.annual_revenue.confidence_tier == DataSourceTier.COMPANY_REPORTED

    def test_10pct_discrepancy_flagged(self):
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                100_000_000,
                DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                80_000_000,  # 20% discrepancy
                DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )

        merged, conflicts = merge_company_data(primary, secondary)

        assert len(conflicts) == 1
        assert conflicts[0].flagged_for_cp is True

    def test_sub_10pct_discrepancy_not_flagged(self):
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                100_000_000,
                DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                95_000_000,  # 5% discrepancy
                DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )

        merged, conflicts = merge_company_data(primary, secondary)

        assert len(conflicts) == 1
        assert conflicts[0].flagged_for_cp is False

    def test_conflict_audit_trail_complete(self):
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                100_000_000,
                DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                120_000_000,
                DataSourceTier.ESTIMATED,
                DataSourceType.FIRECRAWL_CRUNCHBASE,
            ),
        )

        merged, conflicts = merge_company_data(primary, secondary)

        assert len(conflicts) == 1
        c = conflicts[0]
        assert c.field_name == "annual_revenue"
        assert c.primary_value == 100_000_000
        assert c.secondary_value == 120_000_000
        assert c.primary_source == "valyu_sec_filing"
        assert c.secondary_source == "firecrawl_crunchbase"
        assert c.resolution  # Non-empty resolution string
        assert c.chosen_value == 100_000_000  # COMPANY_REPORTED wins

    def test_three_way_conflict_resolved(self):
        source_a = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                100_000_000,
                DataSourceTier.ESTIMATED,
                DataSourceType.FIRECRAWL_CRUNCHBASE,
            ),
        )
        source_b = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                110_000_000,
                DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        source_c = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                105_000_000,
                DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )

        merged, conflicts = merge_company_data(source_a, source_b, source_c)

        # COMPANY_REPORTED (source_c) should win
        assert merged.annual_revenue is not None
        assert merged.annual_revenue.value == 105_000_000
        assert merged.annual_revenue.confidence_tier == DataSourceTier.COMPANY_REPORTED
        assert len(conflicts) == 2  # Two merge conflicts recorded
