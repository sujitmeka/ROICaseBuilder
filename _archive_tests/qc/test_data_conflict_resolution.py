"""Tests for data conflict resolution policy in merge_company_data."""

from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType
from backend.orchestrator.merge import merge_company_data, ConflictEntry


def _make_dp(value, tier, source_type=DataSourceType.VALYU_SEC_FILING, score=0.9):
    """Create a DataPoint for conflict testing."""
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=source_type),
    )


class TestConflictResolutionPolicy:
    """Verify that merge_company_data follows the conflict resolution policy."""

    def test_sec_filing_beats_news_article(self):
        """Higher confidence tier (COMPANY_REPORTED) wins over INDUSTRY_BENCHMARK."""
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                500_000_000, DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                480_000_000, DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        merged, conflicts = merge_company_data(primary, secondary)
        assert merged.annual_revenue is not None
        assert merged.annual_revenue.value == 500_000_000
        assert merged.annual_revenue.confidence_tier == DataSourceTier.COMPANY_REPORTED

    def test_10pct_discrepancy_flagged(self):
        """Revenue values differing by >10% are flagged for CP review."""
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                500_000_000, DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                400_000_000, DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        merged, conflicts = merge_company_data(primary, secondary)
        assert len(conflicts) >= 1
        revenue_conflict = next(c for c in conflicts if c.field_name == "annual_revenue")
        assert revenue_conflict.flagged_for_cp is True

    def test_sub_10pct_discrepancy_not_flagged(self):
        """Revenue values differing by <10% are not flagged for CP review."""
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                500_000_000, DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                495_000_000, DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        merged, conflicts = merge_company_data(primary, secondary)
        # A conflict entry is still created, but flagged_for_cp should be False
        revenue_conflicts = [c for c in conflicts if c.field_name == "annual_revenue"]
        if revenue_conflicts:
            assert revenue_conflicts[0].flagged_for_cp is False
        # If no conflict entry, that's also acceptable (sub-threshold)

    def test_conflict_audit_trail_complete(self):
        """Each ConflictEntry has all required fields populated."""
        primary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                500_000_000, DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        secondary = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                400_000_000, DataSourceTier.ESTIMATED,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        merged, conflicts = merge_company_data(primary, secondary)
        assert len(conflicts) >= 1
        conflict = conflicts[0]
        assert conflict.field_name is not None
        assert conflict.primary_value is not None
        assert conflict.secondary_value is not None
        assert conflict.primary_source is not None
        assert conflict.secondary_source is not None
        assert conflict.resolution is not None and len(conflict.resolution) > 0
        assert conflict.chosen_value is not None

    def test_three_way_conflict_resolved(self):
        """Three CompanyData sources: highest confidence tier wins."""
        source_a = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                500_000_000, DataSourceTier.ESTIMATED,
                DataSourceType.WEBSEARCH_BENCHMARK,
            ),
        )
        source_b = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                520_000_000, DataSourceTier.INDUSTRY_BENCHMARK,
                DataSourceType.WEBSEARCH_INDUSTRY_REPORT,
            ),
        )
        source_c = CompanyData(
            company_name="TestCo",
            industry="retail",
            annual_revenue=_make_dp(
                510_000_000, DataSourceTier.COMPANY_REPORTED,
                DataSourceType.VALYU_SEC_FILING,
            ),
        )
        merged, conflicts = merge_company_data(source_a, source_b, source_c)
        # COMPANY_REPORTED (rank 3) should win
        assert merged.annual_revenue is not None
        assert merged.annual_revenue.confidence_tier == DataSourceTier.COMPANY_REPORTED
        assert merged.annual_revenue.value == 510_000_000
