"""CFO-specific framing prompt for ROI narratives."""

from __future__ import annotations

from backend.engine.result import CalculationResult
from backend.models.enums import Scenario

CFO_FRAMING_PROMPT = """\
Frame all findings using a "Revenue at Risk" perspective. The CFO should \
understand what the company loses by NOT investing in experience transformation.

Key principles:
- Lead with the cost of inaction, not the benefit of action
- Frame every opportunity as revenue the company is currently leaving on the table
- Compare to competitor performance where benchmarks are available
- Highlight the compounding effect: delayed investment means compounding losses
- Present the Conservative scenario as the floor, not the ceiling
- Include ROI multiple and payback period prominently
- Reference specific financial metrics (margin impact, revenue per customer)
- Use language appropriate for board-level presentations
"""


def format_cfo_prompt(calculation_result: CalculationResult) -> str:
    """Format a CFO-specific framing section from calculation results."""
    lines: list[str] = []

    lines.append("## Revenue at Risk Analysis")
    lines.append(
        "The following represents the opportunity cost of maintaining "
        "the status quo:\n"
    )

    scenario_order = [Scenario.CONSERVATIVE, Scenario.MODERATE, Scenario.AGGRESSIVE]
    for scenario in scenario_order:
        result = calculation_result.scenarios.get(scenario)
        if result is None:
            continue

        label = scenario.value.title()
        lines.append(f"### {label} Estimate")
        lines.append(
            f"- Annual Revenue at Risk: ${result.total_annual_impact:,.0f}"
        )
        lines.append(
            f"- 3-Year Cumulative Risk: ${result.cumulative_3yr_impact:,.0f}"
        )
        if result.roi_percentage is not None:
            lines.append(f"- Projected ROI: {result.roi_percentage:.0f}%")
        if result.roi_multiple is not None:
            lines.append(f"- ROI Multiple: {result.roi_multiple:.1f}x")

        # Category breakdown
        if result.impact_by_category:
            lines.append("- Impact by Category:")
            for cat, amount in sorted(
                result.impact_by_category.items(), key=lambda x: -x[1]
            ):
                lines.append(f"  - {cat}: ${amount:,.0f}")

        lines.append("")

    return "\n".join(lines)
