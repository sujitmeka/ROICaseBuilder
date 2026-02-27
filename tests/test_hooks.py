"""Tests for progress hooks — tool name to human message mapping."""

from backend.hooks.progress_hooks import get_progress_message


class TestProgressHooks:
    def test_tool_name_maps_to_human_message(self):
        """Known tool name returns the correct human-readable message."""
        msg = get_progress_message("mcp__cproi-tools__fetch_public_financials")
        assert msg == "Fetching company financial data..."

    def test_unknown_tool_gets_generic_message(self):
        """Unknown tool name returns the generic 'Processing...' message."""
        msg = get_progress_message("some_random_tool")
        assert msg == "Processing..."
