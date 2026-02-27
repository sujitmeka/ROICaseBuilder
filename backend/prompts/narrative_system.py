"""System prompt and formatter for SCR (Situation-Complication-Resolution) narratives."""

from __future__ import annotations

from backend.engine.result import CalculationResult, ScenarioResult
from backend.models.company_data import CompanyData
from backend.models.enums import Scenario

SYSTEM_PROMPT = """\
You are a senior management consultant generating an ROI narrative for a \
client partner presentation. Use the Situation-Complication-Resolution (SCR) \
framework throughout.

## Structure

### Headline
Open with a single compelling headline that quantifies the opportunity or \
impact in dollar terms with a percentage.

### Situation
Describe the client's current state using the provided company data. \
Reference specific metrics with inline [n] citations pointing to numbered \
data sources.

### Complication
Identify what the client is leaving on the table. Frame gaps between current \
performance and industry benchmarks. Use inline [n] citations for every claim.

### Resolution
Present the ROI analysis across three scenarios. Always present the \
Conservative scenario first, then Moderate, then Aggressive. For each \
scenario include:
- Total annual impact as a dollar amount with percentage of revenue
- Key KPI improvements with dollar amounts and percentages
- Confidence indicators

## Citation Rules
- Use inline [n] markers (e.g., [1], [2]) that reference numbered sources
- Every data claim must have at least one citation
- Include confidence badges after each data point:
  - [Company Data] for company-reported or verified data
  - [Benchmark] for industry benchmark data
  - [Estimated] for cross-industry or estimated data

## Formatting
- Use dollar amounts formatted with commas (e.g., $1,250,000)
- Always pair dollar amounts with percentages where applicable
- Bold key numbers for emphasis
- Present Conservative scenario first, Moderate second, Aggressive third

## Sources
End the narrative with a numbered Sources section listing every data source \
referenced by [n] citations in the text. Each source entry should include \
the source name, date, and URL if available.
"""


def format_narrative_prompt(
    calculation_result: CalculationResult,
    company_data: CompanyData,
) -> str:
    """Format the user message with actual calculation data for narrative generation."""
    lines: list[str] = []

    lines.append(f"# ROI Analysis for {calculation_result.company_name}")
    lines.append(f"Industry: {calculation_result.industry}")

    # Revenue context
    revenue_dp = company_data.get("annual_revenue")
    if revenue_dp is not None:
        lines.append(
            f"Annual Revenue: ${revenue_dp.value:,.0f}"
        )

    online_dp = company_data.get("online_revenue")
    if online_dp is not None:
        lines.append(
            f"Online Revenue: ${online_dp.value:,.0f}"
        )

    lines.append(f"\nData Completeness: {calculation_result.data_completeness:.0%}")
    if calculation_result.missing_inputs:
        lines.append(f"Missing Inputs: {', '.join(calculation_result.missing_inputs)}")

    # Scenarios -- Conservative first
    scenario_order = [Scenario.CONSERVATIVE, Scenario.MODERATE, Scenario.AGGRESSIVE]
    for scenario in scenario_order:
        result = calculation_result.scenarios.get(scenario)
        if result is None:
            continue
        lines.append(f"\n## {scenario.value.title()} Scenario")
        lines.append(f"Total Annual Impact: ${result.total_annual_impact:,.0f}")
        if revenue_dp is not None and revenue_dp.value > 0:
            pct = (result.total_annual_impact / revenue_dp.value) * 100
            lines.append(f"Impact as % of Revenue: {pct:.1f}%")
        lines.append(f"Cumulative 3-Year Impact: ${result.cumulative_3yr_impact:,.0f}")
        if result.roi_percentage is not None:
            lines.append(f"ROI: {result.roi_percentage:.0f}%")
        if result.roi_multiple is not None:
            lines.append(f"ROI Multiple: {result.roi_multiple:.1f}x")

        # KPI breakdown
        active_kpis = [k for k in result.kpi_results if not k.skipped]
        if active_kpis:
            lines.append("\nKPI Breakdown:")
            for kpi in active_kpis:
                lines.append(
                    f"- {kpi.kpi_label}: ${kpi.adjusted_impact:,.0f} "
                    f"(raw: ${kpi.raw_impact:,.0f}, "
                    f"confidence discount: {kpi.confidence_discount:.0%})"
                )

    # Data sources summary
    lines.append("\n## Data Sources")
    source_idx = 1
    for field_name in company_data.available_fields():
        dp = company_data.get(field_name)
        if dp is not None:
            label = dp.source.source_label or dp.source.source_type.value
            lines.append(
                f"[{source_idx}] {field_name}: {label} "
                f"(tier: {dp.confidence_tier.value}, score: {dp.confidence_score:.2f})"
            )
            source_idx += 1

    return "\n".join(lines)
