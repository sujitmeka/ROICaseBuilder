"""Integration tests for the calculation engine."""

import math

import pytest

from backend.engine.calculator import CalculationEngine
from backend.methodology.loader import get_default_methodology
from backend.models.enums import Scenario


@pytest.fixture
def engine():
    return CalculationEngine()


@pytest.fixture
def v1_config():
    return get_default_methodology()


class TestCalculationEngine:
    def test_produces_three_scenarios(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        assert len(result.scenarios) == 3
        assert Scenario.CONSERVATIVE in result.scenarios
        assert Scenario.MODERATE in result.scenarios
        assert Scenario.AGGRESSIVE in result.scenarios

    def test_conservative_less_than_moderate(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        conservative = result.scenarios[Scenario.CONSERVATIVE].total_annual_impact_unweighted
        moderate = result.scenarios[Scenario.MODERATE].total_annual_impact_unweighted
        assert conservative < moderate

    def test_moderate_less_than_aggressive(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        moderate = result.scenarios[Scenario.MODERATE].total_annual_impact_unweighted
        aggressive = result.scenarios[Scenario.AGGRESSIVE].total_annual_impact_unweighted
        assert moderate < aggressive

    def test_audit_trail_has_entry_per_kpi(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        for scenario in Scenario:
            sr = result.scenarios[scenario]
            enabled_count = len(v1_config.enabled_kpis())
            assert len(sr.kpi_results) == enabled_count

    def test_realization_curve_applied(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        moderate = result.scenarios[Scenario.MODERATE]
        total = moderate.total_annual_impact_unweighted
        year1 = moderate.year_projections[0].projected_impact
        assert year1 == pytest.approx(total * 0.40, rel=1e-2)

    def test_cumulative_3yr_is_sum(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        moderate = result.scenarios[Scenario.MODERATE]
        year_sum = sum(yp.projected_impact for yp in moderate.year_projections)
        assert moderate.cumulative_3yr_impact == pytest.approx(year_sum, rel=1e-6)

    def test_no_nan_in_results(self, engine, v1_config, retailer_500m):
        result = engine.calculate(retailer_500m, v1_config)
        for scenario in Scenario:
            sr = result.scenarios[scenario]
            assert not math.isnan(sr.total_annual_impact)
            assert not math.isnan(sr.total_annual_impact_unweighted)
            assert not math.isnan(sr.cumulative_3yr_impact)
            for entry in sr.kpi_results:
                assert not math.isnan(entry.raw_impact)
                assert not math.isnan(entry.adjusted_impact)

    def test_moderate_nike_in_expected_range(self, engine, v1_config, nike_data):
        result = engine.calculate(nike_data, v1_config)
        moderate = result.scenarios[Scenario.MODERATE]
        total = moderate.total_annual_impact_unweighted
        # moderate total should be > $1B
        assert total > 1_000_000_000
        # and less than 30% of $51.2B
        assert total < 51_200_000_000 * 0.30
