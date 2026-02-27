"""Load, validate, and select methodology configs from JSON files."""

from __future__ import annotations

import json
from pathlib import Path

from backend.methodology.schema import MethodologyConfig

# Default directory for methodology config files
_CONFIG_DIR = Path(__file__).parent / "configs"


def load_methodology(file_path: Path | None = None) -> MethodologyConfig:
    """Load and validate a methodology config from a JSON file.

    If no path is provided, loads the default V1 config.
    """
    if file_path is None:
        file_path = _CONFIG_DIR / "experience_transformation_design_v1.json"

    if not file_path.exists():
        raise FileNotFoundError(f"Methodology config not found: {file_path}")

    with open(file_path, "r") as f:
        raw = json.load(f)

    return MethodologyConfig.model_validate(raw)


def get_default_methodology() -> MethodologyConfig:
    """Load the default Experience Transformation & Design V1 methodology."""
    return load_methodology()
