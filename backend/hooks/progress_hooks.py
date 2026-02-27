"""Maps MCP tool names to human-readable progress messages for SSE streaming."""

from __future__ import annotations

# Tool name → user-facing progress message
_TOOL_MESSAGES: dict[str, str] = {
    "mcp__cproi-tools__fetch_public_financials": "Fetching company financial data...",
    "mcp__cproi-tools__scrape_private_company": "Scraping company information...",
    "mcp__cproi-tools__search_benchmarks": "Searching for industry benchmarks...",
    "mcp__cproi-tools__run_roi_calculation": "Running ROI calculations...",
    "mcp__cproi-tools__generate_narrative": "Generating executive narrative...",
}

_DEFAULT_MESSAGE = "Processing..."


def get_progress_message(tool_name: str) -> str:
    """Return a human-readable progress message for a given tool name.

    Unknown tools get a generic "Processing..." message.
    """
    return _TOOL_MESSAGES.get(tool_name, _DEFAULT_MESSAGE)
