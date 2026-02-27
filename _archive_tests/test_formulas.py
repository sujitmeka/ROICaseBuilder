"""Unit tests for each KPI formula."""

import pytest

from backend.kpi_library.formulas import (
    calc_aov_increase,
    calc_churn_reduction,
    calc_conversion_rate_lift,
    calc_nps_referral_revenue,
    calc_support_cost_savings,
)
from backend.kpi_library.registry import get_all_kpis


class TestConversionRateLift:
    def test_basic_calculation(self):
        # $200M online revenue * 20% lift = $40M
        result = calc_conversion_rate_lift(
            online_revenue=200_000_000, lift_percentage=0.20
        )
        assert result == pytest.approx(40_000_000)

    def test_conservative_scenario(self):
        # $200M * 10% = $20M
        result = calc_conversion_rate_lift(
            online_revenue=200_000_000, lift_percentage=0.10
        )
        assert result == pytest.approx(20_000_000)

    def test_aggressive_scenario(self):
        # $200M * 35% = $70M
        result = calc_conversion_rate_lift(
            online_revenue=200_000_000, lift_percentage=0.35
        )
        assert result == pytest.approx(70_000_000)

    def test_zero_revenue(self):
        result = calc_conversion_rate_lift(online_revenue=0, lift_percentage=0.20)
        assert result == 0.0

    def test_zero_lift(self):
        result = calc_conversion_rate_lift(
            online_revenue=200_000_000, lift_percentage=0.0
        )
        assert result == 0.0

    def test_negative_revenue_raises(self):
        with pytest.raises(ValueError, match="cannot be negative"):
            calc_conversion_rate_lift(online_revenue=-100, lift_percentage=0.20)

    def test_lift_over_100pct_raises(self):
        with pytest.raises(ValueError, match="must be 0-1.0"):
            calc_conversion_rate_lift(online_revenue=200_000_000, lift_percentage=1.5)


class TestAOVIncrease:
    def test_basic_calculation(self):
        # 1,250,000 orders * $160 * 0.10 = $20M
        result = calc_aov_increase(
            order_volume=1_250_000, current_aov=160.0, lift_percentage=0.10
        )
        assert result == pytest.approx(20_000_000)

    def test_zero_orders(self):
        result = calc_aov_increase(
            order_volume=0, current_aov=160.0, lift_percentage=0.10
        )
        assert result == 0.0


class TestChurnReduction:
    def test_basic_calculation(self):
        # 0.25 * 1M * $200 * 0.15 = $7,500,000
        result = calc_churn_reduction(
            current_churn_rate=0.25,
            customer_count=1_000_000,
            revenue_per_customer=200.0,
            reduction_percentage=0.15,
        )
        assert result == pytest.approx(7_500_000)

    def test_zero_churn(self):
        result = calc_churn_reduction(
            current_churn_rate=0.0,
            customer_count=1_000_000,
            revenue_per_customer=200.0,
            reduction_percentage=0.15,
        )
        assert result == 0.0

    def test_invalid_churn_rate_raises(self):
        with pytest.raises(ValueError, match="must be 0-1.0"):
            calc_churn_reduction(
                current_churn_rate=1.5,
                customer_count=1_000,
                revenue_per_customer=100.0,
                reduction_percentage=0.10,
            )


class TestSupportCostSavings:
    def test_basic_calculation(self):
        # 1M * $10 * 0.30 = $3M
        result = calc_support_cost_savings(
            current_support_contacts=1_000_000,
            cost_per_contact=10.0,
            reduction_percentage=0.30,
        )
        assert result == pytest.approx(3_000_000)


class TestNPSReferralRevenue:
    def test_basic_calculation(self):
        # $500M * (7/7) * 0.01 = $5M
        result = calc_nps_referral_revenue(
            annual_revenue=500_000_000, nps_point_improvement=7
        )
        assert result == pytest.approx(5_000_000)

    def test_zero_improvement(self):
        result = calc_nps_referral_revenue(
            annual_revenue=500_000_000, nps_point_improvement=0
        )
        assert result == 0.0


class TestAllKPIsRegistered:
    def test_five_kpis_registered(self):
        all_kpis = get_all_kpis()
        assert len(all_kpis) == 5

    def test_expected_ids_present(self):
        all_kpis = get_all_kpis()
        expected_ids = [
            "conversion_rate_lift",
            "aov_increase",
            "churn_reduction",
            "support_cost_savings",
            "nps_referral_revenue",
        ]
        for kpi_id in expected_ids:
            assert kpi_id in all_kpis
