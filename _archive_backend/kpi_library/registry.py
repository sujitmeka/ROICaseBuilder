from __future__ import annotations

from dataclasses import dataclass
from typing import Callable, Optional

# Global registry -- maps formula_id -> KPIDefinition
_REGISTRY: dict[str, KPIDefinition] = {}


@dataclass(frozen=True)
class KPIDefinition:
    """A reusable KPI definition in the library."""

    id: str
    label: str
    description: str
    required_inputs: list[str]  # CompanyData field names
    benchmark_input: str  # Which benchmark range value to inject
    formula_fn: Callable[..., float]
    unit: str = "currency"
    category: str = "revenue"


def register_kpi(
    kpi_id: str,
    label: str,
    description: str,
    required_inputs: list[str],
    benchmark_input: str,
    unit: str = "currency",
    category: str = "revenue",
) -> Callable:
    """Decorator to register a formula function as a KPI in the library."""

    def decorator(fn: Callable[..., float]) -> Callable[..., float]:
        definition = KPIDefinition(
            id=kpi_id,
            label=label,
            description=description,
            required_inputs=required_inputs,
            benchmark_input=benchmark_input,
            formula_fn=fn,
            unit=unit,
            category=category,
        )
        _REGISTRY[kpi_id] = definition
        return fn

    return decorator


def get_kpi(kpi_id: str) -> Optional[KPIDefinition]:
    """Look up a KPI definition by ID."""
    return _REGISTRY.get(kpi_id)


def get_all_kpis() -> dict[str, KPIDefinition]:
    """Return the full registry (read-only copy)."""
    return dict(_REGISTRY)
