"""Core calculation engine.

Takes company data + methodology config -> produces CalculationResult
with full audit trail.
"""

from __future__ import annotations

import logging
from typing import Optional

# Ensure all formulas are registered on import
import backend.kpi_library.formulas  # noqa: F401
from backend.engine.result import (
    CalculationResult,
    KPIAuditEntry,
    ScenarioResult,
    YearProjection,
)
from backend.kpi_library.registry import get_kpi
from backend.methodology.schema import KPIConfig, MethodologyConfig
from backend.models.audit import DataPoint
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, Scenario

logger = logging.getLogger(__name__)


class CalculationEngine:
    """Stateless engine that runs ROI calculations."""

    def calculate(
        self,
        company_data: CompanyData,
        methodology_config: MethodologyConfig,
    ) -> CalculationResult:
        """Run the full ROI calculation across all three scenarios."""
        required = methodology_config.required_inputs()
        available = set(company_data.available_fields())
        missing = required - available
        completeness = len(required - missing) / len(required) if required else 1.0

        warnings: list[str] = []
        if missing:
            warnings.append(
                f"Missing inputs: {sorted(missing)}. "
                "KPIs requiring these will be skipped."
            )

        scenarios_to_run = [
            Scenario.CONSERVATIVE,
            Scenario.MODERATE,
            Scenario.AGGRESSIVE,
        ]
        scenario_results: dict[Scenario, ScenarioResult] = {}
        for scenario in scenarios_to_run:
            scenario_results[scenario] = self._run_scenario(
                company_data=company_data,
                config=methodology_config,
                scenario=scenario,
            )

        return CalculationResult(
            company_name=company_data.company_name,
            industry=company_data.industry,
            methodology_id=methodology_config.id,
            methodology_version=methodology_config.version,
            scenarios=scenario_results,
            data_completeness=completeness,
            missing_inputs=sorted(missing),
            available_inputs=sorted(available & required),
            warnings=warnings,
        )

    def _run_scenario(
        self,
        company_data: CompanyData,
        config: MethodologyConfig,
        scenario: Scenario,
    ) -> ScenarioResult:
        """Run a single scenario across all enabled KPIs."""
        kpi_results: list[KPIAuditEntry] = []
        skipped_kpis: list[str] = []

        for kpi_config in config.enabled_kpis():
            entry = self._calculate_single_kpi(
                company_data=company_data,
                kpi_config=kpi_config,
                config=config,
                scenario=scenario,
            )
            kpi_results.append(entry)
            if entry.skipped:
                skipped_kpis.append(entry.kpi_id)

        # Aggregate
        total_unweighted = sum(
            e.adjusted_impact for e in kpi_results if not e.skipped
        )
        total_weighted = sum(
            e.weighted_impact for e in kpi_results if not e.skipped
        )

        # Impact by category
        impact_by_category: dict[str, float] = {}
        for entry in kpi_results:
            if not entry.skipped:
                cat = entry.category
                impact_by_category[cat] = (
                    impact_by_category.get(cat, 0) + entry.adjusted_impact
                )

        # Multi-year projection
        year_projections = self._project_multi_year(
            total_unweighted, config.realization_curve
        )
        cumulative = sum(p.projected_impact for p in year_projections)

        # ROI if engagement cost is available
        engagement_cost_dp = company_data.get("engagement_cost")
        roi_pct: Optional[float] = None
        roi_mult: Optional[float] = None
        eng_cost: Optional[float] = None

        if engagement_cost_dp is not None and engagement_cost_dp.value > 0:
            eng_cost = engagement_cost_dp.value
            roi_pct = ((total_unweighted - eng_cost) / eng_cost) * 100
            roi_mult = total_unweighted / eng_cost

        return ScenarioResult(
            scenario=scenario,
            kpi_results=kpi_results,
            total_annual_impact=total_weighted,
            total_annual_impact_unweighted=total_unweighted,
            impact_by_category=impact_by_category,
            year_projections=year_projections,
            cumulative_3yr_impact=cumulative,
            roi_percentage=roi_pct,
            roi_multiple=roi_mult,
            engagement_cost=eng_cost,
            skipped_kpis=skipped_kpis,
        )

    def _calculate_single_kpi(
        self,
        company_data: CompanyData,
        kpi_config: KPIConfig,
        config: MethodologyConfig,
        scenario: Scenario,
    ) -> KPIAuditEntry:
        """Calculate a single KPI and produce its audit entry."""
        kpi_def = get_kpi(kpi_config.id)
        if kpi_def is None:
            return self._skipped_entry(
                kpi_config, reason=f"KPI '{kpi_config.id}' not found in registry"
            )

        # Gather inputs
        input_data_points: dict[str, DataPoint] = {}
        inputs_used: dict[str, float] = {}
        input_tiers: dict[str, DataSourceTier] = {}
        missing: list[str] = []

        for field_name in kpi_def.required_inputs:
            dp = company_data.get(field_name)
            if dp is None:
                missing.append(field_name)
            else:
                input_data_points[field_name] = dp
                inputs_used[field_name] = dp.value
                input_tiers[field_name] = dp.confidence_tier

        if missing:
            return self._skipped_entry(
                kpi_config, reason=f"Missing required inputs: {missing}"
            )

        # Get benchmark value for this scenario
        benchmark_value = getattr(kpi_config.benchmark_ranges, scenario.value)

        # Build kwargs for the formula function
        kwargs: dict[str, float] = {}
        for field_name in kpi_def.required_inputs:
            kwargs[field_name] = input_data_points[field_name].value
        kwargs[kpi_def.benchmark_input] = benchmark_value

        # Execute formula
        try:
            raw_impact = kpi_def.formula_fn(**kwargs)
        except Exception as e:
            return self._skipped_entry(
                kpi_config, reason=f"Formula error: {e}"
            )

        # Apply confidence discount -- use minimum confidence across all inputs
        confidence_multiplier = self._compute_confidence(
            input_data_points, config
        )
        adjusted_impact = raw_impact * confidence_multiplier
        weighted_impact = adjusted_impact * kpi_config.weight

        return KPIAuditEntry(
            kpi_id=kpi_config.id,
            kpi_label=kpi_config.label or kpi_def.label,
            formula_description=kpi_config.formula,
            inputs_used=inputs_used,
            input_tiers=input_tiers,
            benchmark_value=benchmark_value,
            benchmark_source=kpi_config.benchmark_source,
            raw_impact=raw_impact,
            confidence_discount=confidence_multiplier,
            adjusted_impact=adjusted_impact,
            weight=kpi_config.weight,
            weighted_impact=weighted_impact,
            category=kpi_def.category,
        )

    def _compute_confidence(
        self,
        input_data_points: dict[str, DataPoint],
        config: MethodologyConfig,
    ) -> float:
        """Compute the minimum confidence multiplier across all inputs."""
        if not input_data_points:
            return config.confidence_discounts.estimated

        multipliers = [
            config.confidence_discounts.get_discount(dp.confidence_tier.value)
            for dp in input_data_points.values()
        ]
        return min(multipliers)

    def _project_multi_year(
        self,
        total_annual_impact: float,
        realization_curve: list[float],
    ) -> list[YearProjection]:
        """Project impact across multiple years using the realization curve."""
        projections: list[YearProjection] = []
        cumulative = 0.0

        for i, pct in enumerate(realization_curve):
            year_impact = total_annual_impact * pct
            cumulative += year_impact
            projections.append(
                YearProjection(
                    year=i + 1,
                    realization_percentage=pct,
                    projected_impact=year_impact,
                    cumulative_impact=cumulative,
                )
            )

        return projections

    @staticmethod
    def _skipped_entry(kpi_config: KPIConfig, reason: str) -> KPIAuditEntry:
        """Create a skipped KPI audit entry."""
        return KPIAuditEntry(
            kpi_id=kpi_config.id,
            kpi_label=kpi_config.label or kpi_config.id,
            formula_description=kpi_config.formula,
            inputs_used={},
            input_tiers={},
            benchmark_value=0.0,
            benchmark_source=kpi_config.benchmark_source,
            raw_impact=0.0,
            confidence_discount=0.0,
            adjusted_impact=0.0,
            weight=kpi_config.weight,
            weighted_impact=0.0,
            category="unknown",
            skipped=True,
            skip_reason=reason,
        )
