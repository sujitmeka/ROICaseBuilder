"""Tests for narrative prompt templates and formatting."""

import pytest

from backend.prompts.narrative_system import SYSTEM_PROMPT, format_narrative_prompt
from backend.prompts.narrative_cfo import CFO_FRAMING_PROMPT, format_cfo_prompt
from backend.engine.result import (
    CalculationResult,
    KPIAuditEntry,
    ScenarioResult,
    YearProjection,
)
from backend.models.company_data import CompanyData
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.enums import DataSourceTier, DataSourceType, Scenario


def _make_dp(value, tier=DataSourceTier.COMPANY_REPORTED, score=0.95):
    return DataPoint(
        value=value,
        confidence_tier=tier,
        confidence_score=score,
        source=SourceAttribution(source_type=DataSourceType.VALYU_SEC_FILING),
    )


def _make_sample_result() -> tuple[CalculationResult, CompanyData]:
    """Build a minimal CalculationResult + CompanyData for prompt tests."""
    company_data = CompanyData(
        company_name="Acme Corp",
        industry="retail",
        annual_revenue=_make_dp(500_000_000),
        online_revenue=_make_dp(200_000_000),
    )

    kpi = KPIAuditEntry(
        kpi_id="conversion_rate_improvement",
        kpi_label="Conversion Rate Improvement",
        formula_description="online_revenue * benchmark_uplift",
        inputs_used={"online_revenue": 200_000_000},
        input_tiers={"online_revenue": DataSourceTier.COMPANY_REPORTED},
        benchmark_value=0.15,
        benchmark_source="Baymard Institute 2024",
        raw_impact=30_000_000,
        confidence_discount=1.0,
        adjusted_impact=30_000_000,
        weight=0.25,
        weighted_impact=7_500_000,
        category="revenue_growth",
    )

    year_projections = [
        YearProjection(year=1, realization_percentage=0.4, projected_impact=12_000_000, cumulative_impact=12_000_000),
        YearProjection(year=2, realization_percentage=0.75, projected_impact=22_500_000, cumulative_impact=34_500_000),
        YearProjection(year=3, realization_percentage=1.0, projected_impact=30_000_000, cumulative_impact=64_500_000),
    ]

    scenario_result = ScenarioResult(
        scenario=Scenario.CONSERVATIVE,
        kpi_results=[kpi],
        total_annual_impact=7_500_000,
        total_annual_impact_unweighted=30_000_000,
        impact_by_category={"revenue_growth": 30_000_000},
        year_projections=year_projections,
        cumulative_3yr_impact=64_500_000,
        roi_percentage=1400.0,
        roi_multiple=15.0,
        engagement_cost=2_000_000,
    )

    calc_result = CalculationResult(
        company_name="Acme Corp",
        industry="retail",
        methodology_id="etd-v1",
        methodology_version="1.0.0",
        scenarios={Scenario.CONSERVATIVE: scenario_result},
        data_completeness=0.85,
        missing_inputs=["current_churn_rate"],
        available_inputs=["annual_revenue", "online_revenue"],
    )

    return calc_result, company_data


class TestNarrativeStructure:
    def test_scr_sections_present(self):
        assert "Situation" in SYSTEM_PROMPT
        assert "Complication" in SYSTEM_PROMPT
        assert "Resolution" in SYSTEM_PROMPT

    def test_headline_present(self):
        calc_result, company_data = _make_sample_result()
        output = format_narrative_prompt(calc_result, company_data)
        # The formatted prompt should mention impact or opportunity context
        assert "Impact" in output or "impact" in output or "opportunity" in output or "ROI" in output

    def test_inline_citations_present(self):
        assert "[n]" in SYSTEM_PROMPT or "[1]" in SYSTEM_PROMPT

    def test_confidence_badges_present(self):
        assert "[Company Data]" in SYSTEM_PROMPT
        assert "[Benchmark]" in SYSTEM_PROMPT
        assert "[Estimated]" in SYSTEM_PROMPT

    def test_three_scenarios_present(self):
        assert "Conservative" in SYSTEM_PROMPT
        assert "Moderate" in SYSTEM_PROMPT
        assert "Aggressive" in SYSTEM_PROMPT

    def test_conservative_scenario_presented_first(self):
        # In SYSTEM_PROMPT, Conservative should appear before Moderate and Aggressive
        cons_idx = SYSTEM_PROMPT.index("Conservative")
        mod_idx = SYSTEM_PROMPT.index("Moderate")
        agg_idx = SYSTEM_PROMPT.index("Aggressive")
        assert cons_idx < mod_idx < agg_idx

    def test_dollar_amounts_with_percentages(self):
        calc_result, company_data = _make_sample_result()
        output = format_narrative_prompt(calc_result, company_data)
        assert "$" in output
        assert "%" in output

    def test_sources_section_present(self):
        assert "Sources" in SYSTEM_PROMPT
