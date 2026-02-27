"""CPROIOrchestrator — agent-driven ROI pipeline using Claude Agents SDK.

Uses ClaudeSDKClient with custom tools (Valyu, Firecrawl, CalculationEngine)
and built-in tools (WebSearch, WebFetch) to run a methodology-driven pipeline.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Optional
from uuid import uuid4

from claude_agent_sdk import (
    ClaudeAgentOptions,
    ClaudeSDKClient,
    HookMatcher,
    AssistantMessage,
    TextBlock,
    ToolUseBlock,
    ToolResultBlock,
    create_sdk_mcp_server,
)

from backend.orchestrator.system_prompt import get_system_prompt
from backend.streaming.events import PipelineEventType, SSEEvent
from backend.streaming.manager import StreamManager
from backend.tools.agent_tools import (
    fetch_financials,
    scrape_company,
    run_calculation,
    load_methodology,
)

logger = logging.getLogger(__name__)

# Map tool names to SSE event types for progress streaming
TOOL_EVENT_MAP: dict[str, tuple[PipelineEventType, PipelineEventType]] = {
    "mcp__cproi__load_methodology": (
        PipelineEventType.PIPELINE_STARTED,
        PipelineEventType.COMPANY_IDENTIFIED,
    ),
    "mcp__cproi__fetch_financials": (
        PipelineEventType.DATA_FETCH_STARTED,
        PipelineEventType.DATA_FETCH_COMPLETED,
    ),
    "mcp__cproi__scrape_company": (
        PipelineEventType.DATA_FETCH_STARTED,
        PipelineEventType.DATA_FETCH_COMPLETED,
    ),
    "WebSearch": (
        PipelineEventType.BENCHMARK_SEARCH_STARTED,
        PipelineEventType.BENCHMARK_FOUND,
    ),
    "WebFetch": (
        PipelineEventType.BENCHMARK_SEARCH_STARTED,
        PipelineEventType.BENCHMARK_FOUND,
    ),
    "mcp__cproi__run_calculation": (
        PipelineEventType.CALCULATION_STARTED,
        PipelineEventType.CALCULATION_COMPLETED,
    ),
}


def _summarize_tool_input(tool_name: str, tool_input: dict) -> str:
    """Human-readable summary of what a tool call is doing."""
    if "fetch_financials" in tool_name:
        return f"Fetching financial data for {tool_input.get('company_name', 'company')}"
    if "scrape_company" in tool_name:
        return f"Scraping company data for {tool_input.get('company_name', 'company')}"
    if "run_calculation" in tool_name:
        return "Running ROI calculation engine"
    if "load_methodology" in tool_name:
        return f"Loading methodology for {tool_input.get('service_type', 'service')}"
    if tool_name == "WebSearch":
        return f"Searching: {tool_input.get('query', '')[:80]}"
    if tool_name == "WebFetch":
        return f"Reading: {tool_input.get('url', '')[:80]}"
    return f"Using {tool_name}"


class CPROIOrchestrator:
    """Agent-driven ROI pipeline using Claude Agents SDK."""

    def __init__(self, stream_manager: Optional[StreamManager] = None) -> None:
        self._stream_manager = stream_manager
        self._seq = 0

    async def run(
        self,
        company_name: str,
        industry: str,
        service_type: str,
        case_id: Optional[str] = None,
    ) -> dict[str, Any]:
        """Run the full agentic ROI pipeline.

        The agent reasons about what data to gather, searches for benchmarks,
        runs calculations, and generates a narrative — all driven by the
        methodology config.
        """
        if case_id is None:
            case_id = str(uuid4())

        # Build MCP server with our custom tools
        cproi_server = create_sdk_mcp_server(
            name="cproi",
            version="1.0.0",
            tools=[fetch_financials, scrape_company, run_calculation, load_methodology],
        )

        # Build SSE hooks that emit events as tools are called
        async def sse_post_tool_hook(input_data, tool_use_id, context):
            nonlocal result
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                _, completed_event = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, completed_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            await self._emit(case_id, PipelineEventType.TOOL_CALL_COMPLETED, {
                "tool": tool_name,
                "tool_use_id": tool_use_id,
                "case_id": case_id,
            })
            # Capture calculation result from tool output
            if tool_name == "mcp__cproi__run_calculation":
                tool_result = input_data.get("tool_result", "")
                try:
                    if isinstance(tool_result, str):
                        parsed = json.loads(tool_result)
                    elif isinstance(tool_result, dict):
                        parsed = tool_result
                    else:
                        parsed = {}
                    if "scenarios" in parsed:
                        result = parsed
                except (json.JSONDecodeError, TypeError):
                    pass
            return None

        async def sse_pre_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            tool_input = input_data.get("tool_input", {})
            # Emit generic tool call event (for activity feed)
            await self._emit(case_id, PipelineEventType.TOOL_CALL_STARTED, {
                "tool": tool_name,
                "tool_use_id": tool_use_id,
                "input_summary": _summarize_tool_input(tool_name, tool_input),
                "case_id": case_id,
            })
            # Emit specific pipeline step event
            if tool_name in TOOL_EVENT_MAP:
                started_event, _ = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, started_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            return None

        options = ClaudeAgentOptions(
            system_prompt=get_system_prompt(),
            mcp_servers={"cproi": cproi_server},
            allowed_tools=[
                "mcp__cproi__fetch_financials",
                "mcp__cproi__scrape_company",
                "mcp__cproi__run_calculation",
                "mcp__cproi__load_methodology",
                "WebSearch",
                "WebFetch",
            ],
            hooks={
                "PreToolUse": [
                    HookMatcher(matcher=None, hooks=[sse_pre_tool_hook]),
                ],
                "PostToolUse": [
                    HookMatcher(matcher=None, hooks=[sse_post_tool_hook]),
                ],
            },
        )

        # Emit pipeline started
        await self._emit(case_id, PipelineEventType.PIPELINE_STARTED, {
            "company_name": company_name,
            "industry": industry,
            "service_type": service_type,
        })

        # Build the query prompt
        prompt = (
            f"Analyze the ROI case for {company_name} in the {industry} industry "
            f"using the {service_type} methodology.\n\n"
            f"Follow your process: load the methodology first, then gather financial "
            f"data, fill gaps with web search benchmarks, run the calculation, and "
            f"generate the SCR narrative. Think carefully at each step."
        )

        result: dict[str, Any] = {}
        narrative_chunks: list[str] = []

        # Bug 1 fix: Unset CLAUDECODE env var so the SDK subprocess
        # doesn't think it's nested inside another Claude Code session.
        saved_env = os.environ.pop("CLAUDECODE", None)

        try:
            async with ClaudeSDKClient(options) as client:
                await client.query(prompt)

                async for msg in client.receive_response():
                    if isinstance(msg, AssistantMessage):
                        for block in msg.content:
                            if isinstance(block, TextBlock):
                                narrative_chunks.append(block.text)
                                await self._emit(case_id, PipelineEventType.AGENT_THINKING, {
                                    "text": block.text,
                                })
                                await self._emit(case_id, PipelineEventType.NARRATIVE_CHUNK, {
                                    "text": block.text,
                                })
                            elif isinstance(block, ToolUseBlock):
                                logger.info(f"Agent calling tool: {block.name}")
                            elif isinstance(block, ToolResultBlock):
                                if hasattr(block, "content"):
                                    try:
                                        content_text = ""
                                        if isinstance(block.content, list):
                                            for item in block.content:
                                                if isinstance(item, dict) and item.get("type") == "text":
                                                    content_text = item["text"]
                                        elif isinstance(block.content, str):
                                            content_text = block.content

                                        if content_text:
                                            parsed = json.loads(content_text)
                                            if "scenarios" in parsed:
                                                result = parsed
                                    except (json.JSONDecodeError, TypeError):
                                        pass
        finally:
            # Restore env var if it was set
            if saved_env is not None:
                os.environ["CLAUDECODE"] = saved_env

        # Emit completion
        narrative = "\n".join(narrative_chunks)
        if narrative:
            await self._emit(case_id, PipelineEventType.NARRATIVE_COMPLETED, {
                "narrative": narrative,
            })

        # Bug 3 fix: Include calculation result in PIPELINE_COMPLETED
        # so the frontend can call setResult()
        await self._emit(case_id, PipelineEventType.PIPELINE_COMPLETED, {
            "case_id": case_id,
            "status": "completed",
            "result": result if result else None,
        })

        result["narrative"] = narrative
        result["case_id"] = case_id
        return result

    async def _emit(
        self,
        case_id: str,
        event_type: PipelineEventType,
        data: dict,
    ) -> None:
        """Emit an SSE event if a stream manager is available."""
        if self._stream_manager is None:
            return
        self._seq += 1
        event = SSEEvent(
            event_type=event_type,
            data=data,
            sequence_id=self._seq,
        )
        await self._stream_manager.emit(case_id, event)
