"""Tests for methodology Pydantic schema validation."""

import pytest
from pydantic import ValidationError

from backend.methodology.schema import (
    BenchmarkRanges,
    KPIConfig,
    MethodologyConfig,
)


def _make_kpi_config(kpi_id="conversion_rate_lift", weight=0.30, enabled=True):
    """Helper to build a valid KPIConfig."""
    return {
        "id": kpi_id,
        "weight": weight,
        "formula": "test formula",
        "inputs": ["online_revenue"],
        "benchmark_ranges": {"conservative": 0.10, "moderate": 0.20, "aggressive": 0.35},
        "benchmark_source": "Test source",
        "enabled": enabled,
    }


def _make_config_dict(**overrides):
    """Helper to build a valid MethodologyConfig dict."""
    base = {
        "id": "test",
        "name": "Test Config",
        "version": "1.0",
        "applicable_industries": ["retail"],
        "service_type": "test",
        "kpis": [
            _make_kpi_config("conversion_rate_lift", 0.30),
            _make_kpi_config("aov_increase", 0.20),
            _make_kpi_config("churn_reduction", 0.20),
            _make_kpi_config("support_cost_savings", 0.10),
            _make_kpi_config("nps_referral_revenue", 0.20),
        ],
        "realization_curve": [0.40, 0.70, 0.90],
    }
    base.update(overrides)
    return base


class TestMethodologySchema:
    def test_valid_config_parses(self):
        data = _make_config_dict()
        config = MethodologyConfig.model_validate(data)
        assert config.id == "test"
        assert len(config.kpis) == 5

    def test_weights_sum_to_1(self):
        data = _make_config_dict()
        config = MethodologyConfig.model_validate(data)
        total = config.total_weight()
        assert abs(total - 1.0) < 0.01

    def test_realization_curve_must_have_3_values(self):
        data = _make_config_dict(realization_curve=[])
        with pytest.raises(ValidationError):
            MethodologyConfig.model_validate(data)

    def test_enabled_kpis_filters_correctly(self):
        kpis = [
            _make_kpi_config("conversion_rate_lift", 1.0, enabled=True),
            _make_kpi_config("aov_increase", 0.50, enabled=False),
        ]
        data = _make_config_dict(kpis=kpis)
        config = MethodologyConfig.model_validate(data)
        enabled = config.enabled_kpis()
        assert len(enabled) == 1
        assert enabled[0].id == "conversion_rate_lift"
