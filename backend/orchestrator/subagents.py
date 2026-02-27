"""Subagent definitions for the CPROI orchestrator.

These map to Claude Agent SDK AgentDefinition objects for dispatching
specialized sub-tasks from the main orchestrator.
"""

from claude_agent_sdk import AgentDefinition


FINANCIAL_DATA_AGENT = AgentDefinition(
    description="Retrieves company-specific financial data from SEC filings and databases",
    prompt=(
        "You retrieve company-specific financial data. For public companies, "
        "use fetch_financials to query SEC filings and financial metrics "
        "via the Valyu API. For private companies, use scrape_company "
        "to extract data from Crunchbase via Firecrawl. Return a dict of "
        "populated CompanyData fields with their values and source metadata."
    ),
    tools=["mcp__cproi__fetch_financials", "mcp__cproi__scrape_company"],
    model="sonnet",
)

BENCHMARK_RESEARCH_AGENT = AgentDefinition(
    description="Searches the web for industry benchmark data to fill data gaps",
    prompt=(
        "You gather industry benchmark data for CX and financial metrics. "
        "Given an industry and a list of required fields, use WebSearch "
        "to find current industry averages for metrics like conversion rate, "
        "AOV, churn rate, NPS, and customer lifetime value. Search for "
        "specific, authoritative sources (Baymard, McKinsey, Forrester, "
        "Statista). Return benchmark values with source URLs."
    ),
    tools=["WebSearch", "WebFetch"],
    model="sonnet",
)

CALC_NARRATIVE_AGENT = AgentDefinition(
    description="Runs ROI calculations and generates compelling SCR narratives",
    prompt=(
        "You run the ROI calculation and generate the final narrative. "
        "Use run_calculation with the merged company data and service type "
        "to produce scenario-based ROI projections. Review the results for "
        "reasonableness. Then generate a Situation-Complication-Resolution "
        "(SCR) narrative that frames the ROI findings as a compelling "
        "business case with inline citations."
    ),
    tools=["mcp__cproi__run_calculation"],
    model="sonnet",
)


def get_agent_definitions() -> dict[str, AgentDefinition]:
    """Return all agent definitions keyed by name."""
    return {
        "financial-data": FINANCIAL_DATA_AGENT,
        "benchmark-research": BENCHMARK_RESEARCH_AGENT,
        "calc-narrative": CALC_NARRATIVE_AGENT,
    }
