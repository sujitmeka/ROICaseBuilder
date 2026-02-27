"""Subagent definitions for the CPROI orchestrator.

Each subagent is a dict with name, instructions, and tools (list of tool
function names). These will later map to Claude Agents SDK Agent() constructors.
"""

FINANCIAL_DATA_SUBAGENT: dict = {
    "name": "Financial Data Subagent",
    "instructions": (
        "You retrieve company-specific financial data. For public companies, "
        "use fetch_public_financials to query SEC filings and financial metrics "
        "via the Valyu API. For private companies, use scrape_private_company "
        "to extract data from Crunchbase via Firecrawl. Return a dict of "
        "populated CompanyData fields with their values and source metadata."
    ),
    "tools": ["fetch_public_financials", "scrape_private_company"],
}

BENCHMARK_RESEARCH_SUBAGENT: dict = {
    "name": "Benchmark Research Subagent",
    "instructions": (
        "You gather industry benchmark data for CX and financial metrics. "
        "Given an industry and a list of required fields, use search_benchmarks "
        "to find current industry averages for metrics like conversion rate, "
        "AOV, churn rate, NPS, and customer lifetime value. Return benchmark "
        "values with their sources for audit trail purposes."
    ),
    "tools": ["search_benchmarks"],
}

CALC_NARRATIVE_SUBAGENT: dict = {
    "name": "Calculation & Narrative Subagent",
    "instructions": (
        "You run the ROI calculation and generate the final narrative. "
        "Use run_roi_calculation with the merged company data and service type "
        "to produce scenario-based ROI projections. Then use generate_narrative "
        "to create a Situation-Complication-Resolution (SCR) narrative that "
        "frames the ROI findings as a compelling business case."
    ),
    "tools": ["run_roi_calculation", "generate_narrative"],
}


def get_subagent_definitions() -> list[dict]:
    """Return all subagent definitions."""
    return [
        FINANCIAL_DATA_SUBAGENT,
        BENCHMARK_RESEARCH_SUBAGENT,
        CALC_NARRATIVE_SUBAGENT,
    ]
