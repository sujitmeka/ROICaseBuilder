"""Maps MCP tool names to human-readable progress messages for SSE streaming."""

from __future__ import annotations

# Tool name -> user-facing progress message
_TOOL_MESSAGES: dict[str, str] = {
    "mcp__cproi__fetch_financials": "Fetching company financial data...",
    "mcp__cproi__scrape_company": "Scraping company information...",
    "mcp__cproi__load_methodology": "Loading methodology configuration...",
    "mcp__cproi__run_calculation": "Running ROI calculations...",
    "WebSearch": "Searching for industry benchmarks...",
    "WebFetch": "Fetching benchmark data from source...",
}

_DEFAULT_MESSAGE = "Processing..."


def get_progress_message(tool_name: str) -> str:
    """Return a human-readable progress message for a given tool name.

    Unknown tools get a generic "Processing..." message.
    """
    return _TOOL_MESSAGES.get(tool_name, _DEFAULT_MESSAGE)
