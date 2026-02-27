"""Regression tests for Nike retail scenario -- guards against calculation drift."""

import math

from backend.engine.calculator import CalculationEngine
from backend.methodology.loader import get_default_methodology
from backend.models.enums import Scenario


class TestNikeRetailRegression:
    """Regression baselines for Nike-like inputs."""

    def _run(self, nike_data):
        engine = CalculationEngine()
        methodology = get_default_methodology()
        return engine.calculate(nike_data, methodology), methodology

    def test_moderate_total_in_expected_range(self, nike_data):
        """Moderate total_annual_impact is within a plausible range for Nike."""
        result, _ = self._run(nike_data)
        moderate = result.scenarios[Scenario.MODERATE]
        # Nike $51.2B revenue: moderate impact should be >$1B and <$15B
        assert moderate.total_annual_impact > 1_000_000_000, (
            f"Moderate impact {moderate.total_annual_impact:,.0f} too low for Nike"
        )
        assert moderate.total_annual_impact < 15_000_000_000, (
            f"Moderate impact {moderate.total_annual_impact:,.0f} too high for Nike"
        )

    def test_conservative_less_than_moderate(self, nike_data):
        """Conservative scenario produces lower impact than moderate."""
        result, _ = self._run(nike_data)
        conservative = result.scenarios[Scenario.CONSERVATIVE]
        moderate = result.scenarios[Scenario.MODERATE]
        assert conservative.total_annual_impact < moderate.total_annual_impact, (
            f"Conservative {conservative.total_annual_impact:,.0f} >= "
            f"Moderate {moderate.total_annual_impact:,.0f}"
        )

    def test_aggressive_greater_than_moderate(self, nike_data):
        """Aggressive scenario produces higher impact than moderate."""
        result, _ = self._run(nike_data)
        aggressive = result.scenarios[Scenario.AGGRESSIVE]
        moderate = result.scenarios[Scenario.MODERATE]
        assert aggressive.total_annual_impact > moderate.total_annual_impact, (
            f"Aggressive {aggressive.total_annual_impact:,.0f} <= "
            f"Moderate {moderate.total_annual_impact:,.0f}"
        )

    def test_roi_percentage_positive(self, nike_data):
        """ROI percentage should be strongly positive for Nike with $2M engagement cost."""
        result, _ = self._run(nike_data)
        moderate = result.scenarios[Scenario.MODERATE]
        assert moderate.roi_percentage is not None, "ROI percentage should be computed"
        # With $51B revenue and $2M engagement cost, ROI should be >> 100%
        assert moderate.roi_percentage > 100, (
            f"ROI {moderate.roi_percentage:.1f}% too low for Nike"
        )

    def test_realization_curve_applied_correctly(self, nike_data):
        """Year projections use the methodology's realization curve percentages."""
        result, methodology = self._run(nike_data)

        for scenario in Scenario:
            sr = result.scenarios[scenario]
            total = sr.total_annual_impact_unweighted
            for i, proj in enumerate(sr.year_projections):
                expected_pct = methodology.realization_curve[i]
                expected_impact = total * expected_pct
                assert math.isclose(proj.projected_impact, expected_impact, rel_tol=0.01), (
                    f"Scenario {scenario.value}, Year {i+1}: "
                    f"expected {expected_impact:,.0f}, got {proj.projected_impact:,.0f}"
                )
