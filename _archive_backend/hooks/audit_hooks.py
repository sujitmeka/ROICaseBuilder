"""Audit hooks — logs tool calls for the audit trail."""

from __future__ import annotations

import logging
from datetime import datetime, timezone
from typing import Any

logger = logging.getLogger(__name__)


def log_tool_call(
    case_id: str,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    result: Any = None,
) -> dict[str, Any]:
    """Record a tool invocation in the audit log.

    Returns the audit entry dict for downstream persistence.
    """
    entry = {
        "case_id": case_id,
        "tool_name": tool_name,
        "arguments": arguments or {},
        "timestamp": datetime.now(tz=timezone.utc).isoformat(),
        "result_summary": str(result)[:500] if result is not None else None,
    }
    logger.info("Tool call audit: %s → %s", tool_name, case_id)
    return entry
