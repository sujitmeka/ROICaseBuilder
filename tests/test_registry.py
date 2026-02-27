"""Tests for the KPI registry."""

import backend.kpi_library.formulas  # noqa: F401
from backend.kpi_library.registry import get_all_kpis, get_kpi


class TestKPIRegistry:
    def test_register_kpi_adds_to_registry(self):
        all_kpis = get_all_kpis()
        assert len(all_kpis) >= 1

    def test_get_kpi_returns_definition(self):
        kpi = get_kpi("conversion_rate_lift")
        assert kpi is not None
        assert kpi.id == "conversion_rate_lift"
        assert kpi.label == "Conversion Rate Improvement"

    def test_get_kpi_returns_none_for_missing(self):
        kpi = get_kpi("nonexistent_kpi")
        assert kpi is None

    def test_registered_formula_is_callable(self):
        kpi = get_kpi("conversion_rate_lift")
        assert kpi is not None
        assert callable(kpi.formula_fn)
        result = kpi.formula_fn(online_revenue=100_000, lift_percentage=0.10)
        assert result == 10_000.0
