"""Immutable result and audit trail data structures."""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Optional

from backend.models.enums import DataSourceTier, Scenario


@dataclass(frozen=True)
class KPIAuditEntry:
    """Complete audit trail for a single KPI calculation."""

    kpi_id: str
    kpi_label: str
    formula_description: str
    inputs_used: dict[str, float]
    input_tiers: dict[str, DataSourceTier]
    benchmark_value: float
    benchmark_source: str
    raw_impact: float
    confidence_discount: float
    adjusted_impact: float
    weight: float
    weighted_impact: float
    category: str
    skipped: bool = False
    skip_reason: Optional[str] = None


@dataclass(frozen=True)
class YearProjection:
    """Single year in the multi-year projection."""

    year: int
    realization_percentage: float
    projected_impact: float
    cumulative_impact: float


@dataclass(frozen=True)
class ScenarioResult:
    """Results for a single scenario (conservative/moderate/aggressive)."""

    scenario: Scenario
    kpi_results: list[KPIAuditEntry]
    total_annual_impact: float
    total_annual_impact_unweighted: float
    impact_by_category: dict[str, float]
    year_projections: list[YearProjection]
    cumulative_3yr_impact: float
    roi_percentage: Optional[float] = None
    roi_multiple: Optional[float] = None
    engagement_cost: Optional[float] = None
    skipped_kpis: list[str] = field(default_factory=list)


@dataclass(frozen=True)
class CalculationResult:
    """Top-level result object for a complete ROI calculation."""

    company_name: str
    industry: str
    methodology_id: str
    methodology_version: str
    scenarios: dict[Scenario, ScenarioResult]
    data_completeness: float
    missing_inputs: list[str]
    available_inputs: list[str]
    warnings: list[str] = field(default_factory=list)
