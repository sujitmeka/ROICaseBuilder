"""Tests for audit trail completeness across all KPI calculations."""

import math

from backend.engine.calculator import CalculationEngine
from backend.engine.result import KPIAuditEntry
from backend.methodology.loader import get_default_methodology
from backend.models.enums import Scenario


class TestAuditTrailCompleteness:
    """Verify that every KPI calculation produces a complete audit trail."""

    def _run_calculation(self, retailer_500m):
        engine = CalculationEngine()
        methodology = get_default_methodology()
        return engine.calculate(retailer_500m, methodology), methodology

    def test_every_kpi_has_audit_entry(self, retailer_500m):
        """For each scenario, every enabled KPI has an audit entry."""
        result, methodology = self._run_calculation(retailer_500m)
        enabled_ids = {k.id for k in methodology.enabled_kpis()}

        for scenario in (Scenario.CONSERVATIVE, Scenario.MODERATE, Scenario.AGGRESSIVE):
            scenario_result = result.scenarios[scenario]
            audit_ids = {e.kpi_id for e in scenario_result.kpi_results}
            # Every enabled KPI should appear in the audit trail
            assert audit_ids == enabled_ids, (
                f"Scenario {scenario.value}: expected KPI IDs {enabled_ids}, "
                f"got {audit_ids}"
            )

    def test_audit_entry_has_required_fields(self, retailer_500m):
        """Each non-skipped KPIAuditEntry has all required fields populated."""
        result, _ = self._run_calculation(retailer_500m)

        for scenario in Scenario:
            scenario_result = result.scenarios[scenario]
            for entry in scenario_result.kpi_results:
                if entry.skipped:
                    continue
                assert entry.kpi_id is not None, "kpi_id must not be None"
                assert entry.formula_description is not None, "formula_description must not be None"
                assert isinstance(entry.inputs_used, dict), "inputs_used must be a dict"
                assert entry.benchmark_value is not None, "benchmark_value must not be None"
                assert entry.raw_impact is not None, "raw_impact must not be None"
                assert entry.adjusted_impact is not None, "adjusted_impact must not be None"
                assert entry.confidence_discount is not None, "confidence_discount must not be None"

    def test_impact_breakdown_matches_audit_sum(self, retailer_500m):
        """Sum of all KPI weighted_impacts equals the scenario total_annual_impact."""
        result, _ = self._run_calculation(retailer_500m)

        for scenario in Scenario:
            scenario_result = result.scenarios[scenario]
            audit_sum = sum(
                e.weighted_impact for e in scenario_result.kpi_results if not e.skipped
            )
            assert math.isclose(
                audit_sum, scenario_result.total_annual_impact, rel_tol=0.01
            ), (
                f"Scenario {scenario.value}: audit sum {audit_sum:,.2f} != "
                f"total {scenario_result.total_annual_impact:,.2f}"
            )

    def test_cumulative_3yr_matches_realization_curve(self, retailer_500m):
        """cumulative_3yr equals sum of year projections (realization curve applied)."""
        result, methodology = self._run_calculation(retailer_500m)

        for scenario in Scenario:
            sr = result.scenarios[scenario]
            # Sum of all year projected_impacts should equal cumulative_3yr_impact
            year_sum = sum(p.projected_impact for p in sr.year_projections)
            assert math.isclose(year_sum, sr.cumulative_3yr_impact, rel_tol=0.01), (
                f"Scenario {scenario.value}: year sum {year_sum:,.2f} != "
                f"cumulative_3yr {sr.cumulative_3yr_impact:,.2f}"
            )
            # Each year projection uses the correct realization percentage
            for i, proj in enumerate(sr.year_projections):
                expected_pct = methodology.realization_curve[i]
                assert math.isclose(proj.realization_percentage, expected_pct, rel_tol=0.001)

    def test_no_nan_or_negative_impacts(self, retailer_500m):
        """No NaN values anywhere in results; no negative adjusted_impact values."""
        result, _ = self._run_calculation(retailer_500m)

        for scenario in Scenario:
            sr = result.scenarios[scenario]
            assert not math.isnan(sr.total_annual_impact), "total_annual_impact is NaN"
            assert not math.isnan(sr.cumulative_3yr_impact), "cumulative_3yr_impact is NaN"

            for entry in sr.kpi_results:
                if entry.skipped:
                    continue
                assert not math.isnan(entry.raw_impact), f"{entry.kpi_id}: raw_impact is NaN"
                assert not math.isnan(entry.adjusted_impact), f"{entry.kpi_id}: adjusted_impact is NaN"
                assert entry.adjusted_impact >= 0, (
                    f"{entry.kpi_id}: negative adjusted_impact {entry.adjusted_impact}"
                )
