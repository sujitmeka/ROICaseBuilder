"""Tests for methodology config loading."""

from pathlib import Path

import pytest

from backend.methodology.loader import get_default_methodology, load_methodology
from backend.methodology.schema import MethodologyConfig
from backend.kpi_library.registry import get_all_kpis


CONFIG_DIR = (
    Path(__file__).parent.parent
    / "backend"
    / "methodology"
    / "configs"
)


class TestMethodologyLoader:
    def test_load_v1_config(self):
        config = load_methodology(
            CONFIG_DIR / "experience_transformation_design_v1.json"
        )
        assert isinstance(config, MethodologyConfig)
        assert config.id == "experience-transformation-design"

    def test_v1_has_5_kpis(self):
        config = load_methodology(
            CONFIG_DIR / "experience_transformation_design_v1.json"
        )
        assert len(config.kpis) == 5

    def test_v1_kpi_ids_match_registry(self):
        config = load_methodology(
            CONFIG_DIR / "experience_transformation_design_v1.json"
        )
        registry_ids = set(get_all_kpis().keys())
        config_ids = {kpi.id for kpi in config.kpis}
        assert config_ids == registry_ids

    def test_get_default_methodology(self):
        config = get_default_methodology()
        assert isinstance(config, MethodologyConfig)
        assert config.id == "experience-transformation-design"

    def test_realization_curve_is_040_070_090(self):
        config = get_default_methodology()
        assert config.realization_curve == [0.40, 0.70, 0.90]
