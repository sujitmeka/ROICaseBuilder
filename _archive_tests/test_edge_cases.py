"""Edge case tests -- zero revenue, missing inputs, confidence impact."""

import pytest

from backend.engine.calculator import CalculationEngine
from backend.methodology.loader import get_default_methodology
from backend.models.company_data import CompanyData
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.enums import DataSourceTier, DataSourceType, Scenario


def make_dp(value, tier=DataSourceTier.COMPANY_REPORTED):
    """Helper to create a DataPoint with minimal boilerplate."""
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=0.95,
        source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
    )


@pytest.fixture
def engine():
    return CalculationEngine()


@pytest.fixture
def v1_config():
    return get_default_methodology()


class TestEdgeCases:
    def test_zero_revenue_produces_zero_impact(self, engine, v1_config):
        """CompanyData with annual_revenue=0, online_revenue=0 should produce zero impact."""
        zero_company = CompanyData(
            company_name="Zero Corp",
            industry="retail",
            annual_revenue=make_dp(0),
            online_revenue=make_dp(0),
            order_volume=make_dp(0),
            current_aov=make_dp(0),
            current_churn_rate=make_dp(0),
            customer_count=make_dp(0),
            revenue_per_customer=make_dp(0),
            current_support_contacts=make_dp(0),
            cost_per_contact=make_dp(0),
        )
        result = engine.calculate(zero_company, v1_config)
        moderate = result.scenarios[Scenario.MODERATE]
        assert moderate.total_annual_impact_unweighted == 0.0
        assert moderate.cumulative_3yr_impact == 0.0

    def test_missing_inputs_skips_kpi(self, engine, v1_config, minimal_company_data):
        """minimal_company_data (only revenue) should run at least 1 KPI and skip >= 1."""
        result = engine.calculate(minimal_company_data, v1_config)
        moderate = result.scenarios[Scenario.MODERATE]

        computed = [e for e in moderate.kpi_results if not e.skipped]
        skipped = [e for e in moderate.kpi_results if e.skipped]

        # At least 1 KPI runs (nps_referral_revenue needs only annual_revenue)
        assert len(computed) >= 1
        # At least 1 KPI is skipped
        assert len(skipped) >= 1

    def test_estimated_data_applies_discount(self, engine, v1_config):
        """Same inputs with ESTIMATED tier should produce smaller impact than COMPANY_REPORTED."""
        high_conf = CompanyData(
            company_name="HC Corp",
            industry="retail",
            annual_revenue=make_dp(500_000_000, DataSourceTier.COMPANY_REPORTED),
        )
        low_conf = CompanyData(
            company_name="LC Corp",
            industry="retail",
            annual_revenue=make_dp(500_000_000, DataSourceTier.ESTIMATED),
        )

        result_hc = engine.calculate(high_conf, v1_config)
        result_lc = engine.calculate(low_conf, v1_config)

        # Both should have NPS KPI compute (needs only annual_revenue)
        hc_nps = next(
            e for e in result_hc.scenarios[Scenario.MODERATE].kpi_results
            if e.kpi_id == "nps_referral_revenue" and not e.skipped
        )
        lc_nps = next(
            e for e in result_lc.scenarios[Scenario.MODERATE].kpi_results
            if e.kpi_id == "nps_referral_revenue" and not e.skipped
        )

        # Same raw impact
        assert hc_nps.raw_impact == lc_nps.raw_impact
        # COMPANY_REPORTED (1.0) > ESTIMATED (0.4)
        assert hc_nps.adjusted_impact > lc_nps.adjusted_impact
