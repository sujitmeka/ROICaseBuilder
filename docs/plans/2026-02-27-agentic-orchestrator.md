# Agentic Orchestrator Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the procedural pipeline with Claude Agents SDK orchestration so agents reason about what data to gather, fill gaps via real web search, verify calculations, and generate narratives.

**Architecture:** A `ClaudeSDKClient` orchestrator agent reads the methodology config, dispatches tool calls to gather financial data (Valyu/Firecrawl) and benchmark data (WebSearch/WebFetch), merges results, runs calculations via a custom tool, then generates an SCR narrative. `PostToolUse` hooks emit SSE events so the frontend streams progress in real-time.

**Tech Stack:** `claude-agent-sdk==0.1.44`, Python 3.12, FastAPI, existing CPROI engine/models/streaming

---

## Context for the Implementer

### What exists and works (DO NOT TOUCH):
- `backend/models/` — CompanyData, DataPoint, SourceAttribution, enums
- `backend/methodology/` — schema, loader, KPI library, JSON configs
- `backend/engine/` — CalculationEngine, CalculationResult, KPIAuditEntry
- `backend/streaming/` — StreamManager, SSEEvent, PipelineEventType (23 types)
- `backend/main.py` — FastAPI with POST /api/cases, GET /stream, GET /case
- `frontend/` — Next.js app with streaming pipeline view
- `tests/conftest.py` — shared fixtures (retailer_500m, nike_data, minimal_company_data)
- All 158 existing tests

### What we're replacing:
- `backend/orchestrator/agent.py` — procedural pipeline → SDK-driven agent
- `backend/orchestrator/data_orchestrator.py` — DELETE (agent replaces this)
- `backend/tools/agent_tools.py` — rewrite tools with `@tool` decorator for SDK
- `backend/providers/websearch_provider.py` — DELETE (agent uses built-in WebSearch)
- `backend/orchestrator/subagents.py` — convert to real `AgentDefinition` objects

### Key SDK patterns:
```python
from claude_agent_sdk import (
    tool, create_sdk_mcp_server, ClaudeAgentOptions, ClaudeSDKClient,
    AgentDefinition, HookMatcher, AssistantMessage, TextBlock, ToolUseBlock,
)

# Custom tool: @tool("name", "description", {param: type})
@tool("fetch_financials", "Fetch company financials from SEC filings", {
    "company_name": str, "industry": str
})
async def fetch_financials(args):
    return {"content": [{"type": "text", "text": json.dumps(result)}]}

# MCP server bundles tools
server = create_sdk_mcp_server(name="cproi", version="1.0", tools=[...])

# Options wire everything together
options = ClaudeAgentOptions(
    mcp_servers={"cproi": server},
    allowed_tools=["mcp__cproi__fetch_financials", "WebSearch", "WebFetch"],
    hooks={"PostToolUse": [HookMatcher(matcher=None, hooks=[sse_hook])]}
)

# Run the agent
async with ClaudeSDKClient(options=options) as client:
    await client.query("Analyze Nike for retail experience transformation")
    async for msg in client.receive_response():
        # Process assistant messages, tool uses, results
```

### The agent pipeline flow:
```
1. Orchestrator reads methodology config (via load_methodology tool)
   → Identifies required input fields from KPI definitions
2. Orchestrator calls fetch_financials tool
   → Valyu for public, Firecrawl for private
   → Returns populated fields + gaps
3. Orchestrator reasons about gaps
   → "Got annual_revenue but missing current_conversion_rate..."
   → Uses built-in WebSearch to find real benchmark data
   → "Search: retail average conversion rate 2024 Baymard"
4. Orchestrator calls run_calculation tool with merged data
   → Engine runs 3 scenarios, returns full audit trail
5. Orchestrator reasons about results
   → Sanity-checks numbers, flags warnings
   → Generates SCR narrative using calculation context
6. PostToolUse hooks emit SSE events at each step → frontend streams live
```

---

### Task 1: Register Custom Tools with SDK @tool Decorator

**Files:**
- Modify: `backend/tools/agent_tools.py`
- Test: `tests/test_agent_tools.py`

**Step 1: Write the failing test**

Create `tests/test_agent_tools.py`:

```python
"""Tests for SDK-compatible agent tools."""

import json
import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from backend.tools.agent_tools import (
    fetch_financials,
    scrape_company,
    run_calculation,
    load_methodology,
)


class TestFetchFinancials:

    @pytest.mark.asyncio
    async def test_returns_mcp_content_format(self):
        """Tool must return {"content": [{"type": "text", "text": ...}]}"""
        with patch("backend.tools.agent_tools.ValyuProvider") as MockValyu:
            mock_provider = AsyncMock()
            mock_data = MagicMock()
            mock_data.company_name = "Nike"
            mock_data.industry = "retail"
            mock_data.available_fields.return_value = ["annual_revenue"]
            mock_data.annual_revenue = MagicMock(value=51_200_000_000)
            mock_data._data_gaps = []
            mock_provider.fetch.return_value = mock_data
            MockValyu.return_value = mock_provider

            result = await fetch_financials({"company_name": "Nike", "industry": "retail"})

            assert "content" in result
            assert result["content"][0]["type"] == "text"
            payload = json.loads(result["content"][0]["text"])
            assert "fields" in payload
            assert "annual_revenue" in payload["fields"]


class TestRunCalculation:

    @pytest.mark.asyncio
    async def test_returns_scenarios(self):
        """run_calculation tool should return 3 scenarios."""
        # Build minimal company_data_dict
        company_data_dict = {
            "company_name": "Acme",
            "industry": "retail",
            "fields": {
                "online_revenue": {"value": 200_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "annual_revenue": {"value": 500_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
            }
        }
        result = await run_calculation({
            "company_data": company_data_dict,
            "service_type": "experience-transformation-design",
        })

        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert "scenarios" in payload
        assert "conservative" in payload["scenarios"]
        assert "moderate" in payload["scenarios"]
        assert "aggressive" in payload["scenarios"]


class TestLoadMethodology:

    @pytest.mark.asyncio
    async def test_returns_kpi_list(self):
        """load_methodology should return methodology with KPI details."""
        result = await load_methodology({
            "service_type": "experience-transformation-design",
        })

        assert "content" in result
        payload = json.loads(result["content"][0]["text"])
        assert "kpis" in payload
        assert len(payload["kpis"]) >= 5
        # Each KPI should list its required inputs
        for kpi in payload["kpis"]:
            assert "id" in kpi
            assert "inputs" in kpi
```

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest tests/test_agent_tools.py -v`
Expected: FAIL — current tools don't return MCP content format

**Step 3: Rewrite agent_tools.py with @tool decorator**

Rewrite `backend/tools/agent_tools.py`:

```python
"""Custom tools for the CPROI agent — registered with Claude Agent SDK.

Each tool returns MCP-compatible response format:
{"content": [{"type": "text", "text": "<json_string>"}]}
"""

from __future__ import annotations

import json
import logging
from dataclasses import fields as dataclass_fields
from typing import Any

from claude_agent_sdk import tool

from backend.engine.calculator import CalculationEngine
from backend.engine.result import CalculationResult
from backend.methodology.loader import get_default_methodology
from backend.methodology.schema import MethodologyConfig
from backend.models.audit import DataPoint, SourceAttribution
from backend.models.company_data import CompanyData
from backend.models.enums import DataSourceTier, DataSourceType
from backend.providers.valyu_provider import ValyuProvider
from backend.providers.firecrawl_provider import FirecrawlProvider

logger = logging.getLogger(__name__)


def _text_response(data: Any) -> dict:
    """Wrap data in MCP tool response format."""
    return {"content": [{"type": "text", "text": json.dumps(data, default=str)}]}


@tool(
    "fetch_financials",
    "Fetch company financial data from SEC filings (public) or Crunchbase (private). "
    "Returns populated fields with values and a list of data gaps.",
    {"company_name": str, "industry": str},
)
async def fetch_financials(args: dict) -> dict:
    company_name = args["company_name"]
    industry = args["industry"]

    # Try Valyu first (public companies / SEC filings)
    provider = ValyuProvider()
    try:
        company_data = await provider.fetch(company_name, industry)
    except Exception as e:
        logger.warning(f"Valyu failed for {company_name}, trying Firecrawl: {e}")
        # Fall back to Firecrawl for private companies
        provider = FirecrawlProvider()
        try:
            company_data = await provider.fetch(company_name, industry)
        except Exception as e2:
            logger.error(f"Both providers failed for {company_name}: {e2}")
            return _text_response({
                "company_name": company_name,
                "industry": industry,
                "fields": {},
                "gaps": ["all_fields"],
                "error": f"Could not fetch financial data: {e2}",
            })

    result = _company_data_to_dict(company_data)
    result["gaps"] = getattr(company_data, "_data_gaps", [])
    return _text_response(result)


@tool(
    "scrape_company",
    "Scrape private company data from Crunchbase/PitchBook via Firecrawl. "
    "Use this when fetch_financials returns no data for a private company.",
    {"company_name": str, "industry": str},
)
async def scrape_company(args: dict) -> dict:
    company_name = args["company_name"]
    industry = args["industry"]

    provider = FirecrawlProvider()
    try:
        company_data = await provider.fetch(company_name, industry)
    except Exception as e:
        return _text_response({
            "company_name": company_name,
            "fields": {},
            "gaps": ["all_fields"],
            "error": str(e),
        })

    result = _company_data_to_dict(company_data)
    result["gaps"] = getattr(company_data, "_data_gaps", [])
    return _text_response(result)


@tool(
    "run_calculation",
    "Run ROI calculation against company data using the methodology engine. "
    "Returns 3 scenarios (conservative/moderate/aggressive) with full audit trail. "
    "The company_data should include all available fields gathered from financial "
    "data and benchmark research.",
    {"company_data": dict, "service_type": str},
)
async def run_calculation(args: dict) -> dict:
    company_data = _dict_to_company_data(args["company_data"])
    methodology = get_default_methodology()
    engine = CalculationEngine()
    result = engine.calculate(company_data, methodology)
    return _text_response(_calculation_result_to_dict(result))


@tool(
    "load_methodology",
    "Load the methodology configuration for a service type. Returns the full "
    "methodology config including KPI definitions, required inputs, benchmark "
    "ranges, weights, and realization curve. Use this FIRST to understand what "
    "data fields you need to gather.",
    {"service_type": str},
)
async def load_methodology(args: dict) -> dict:
    methodology = get_default_methodology()
    # Return a simplified view focused on what the agent needs
    kpis = []
    all_inputs: set[str] = set()
    for kpi in methodology.enabled_kpis():
        kpi_info = {
            "id": kpi.id,
            "label": kpi.label,
            "weight": kpi.weight,
            "formula": kpi.formula,
            "inputs": kpi.inputs,
            "benchmark_ranges": {
                "conservative": kpi.benchmark_ranges.conservative,
                "moderate": kpi.benchmark_ranges.moderate,
                "aggressive": kpi.benchmark_ranges.aggressive,
            },
            "benchmark_source": kpi.benchmark_source,
        }
        kpis.append(kpi_info)
        all_inputs.update(kpi.inputs)

    return _text_response({
        "id": methodology.id,
        "name": methodology.name,
        "version": methodology.version,
        "kpis": kpis,
        "required_inputs": sorted(all_inputs),
        "realization_curve": methodology.realization_curve,
        "confidence_discounts": {
            k: v for k, v in methodology.confidence_discounts.items()
        },
    })


# ---------------------------------------------------------------------------
# Helpers (same logic as before, just moved to support new tool format)
# ---------------------------------------------------------------------------

def _company_data_to_dict(company_data: CompanyData) -> dict:
    """Convert CompanyData to a serializable dict."""
    result: dict[str, Any] = {
        "company_name": company_data.company_name,
        "industry": company_data.industry,
        "fields": {},
    }
    for f in dataclass_fields(company_data):
        if f.name in CompanyData._NON_DATA_FIELDS:
            continue
        dp = getattr(company_data, f.name)
        if dp is not None and isinstance(dp, DataPoint):
            result["fields"][f.name] = {
                "value": dp.value,
                "confidence_tier": dp.confidence_tier.value,
                "confidence_score": dp.confidence_score,
            }
    return result


def _dict_to_company_data(d: dict) -> CompanyData:
    """Reconstruct a CompanyData from a serialized dict."""
    company_data = CompanyData(
        company_name=d.get("company_name", "Unknown"),
        industry=d.get("industry", "unknown"),
    )
    fields_dict = d.get("fields", {})
    for field_name, field_data in fields_dict.items():
        if hasattr(company_data, field_name):
            tier_value = field_data.get("confidence_tier", "estimated")
            dp = DataPoint(
                value=field_data["value"],
                confidence_tier=DataSourceTier(tier_value),
                confidence_score=field_data.get("confidence_score", 0.5),
                source=SourceAttribution(
                    source_type=DataSourceType.MANUAL_OVERRIDE,
                    source_label="Reconstructed from agent tool response",
                ),
            )
            setattr(company_data, field_name, dp)
    return company_data


def _calculation_result_to_dict(result: CalculationResult) -> dict:
    """Convert CalculationResult to a serializable dict."""
    scenarios: dict[str, Any] = {}
    for scenario, sr in result.scenarios.items():
        kpi_results = []
        for entry in sr.kpi_results:
            kpi_results.append({
                "kpi_id": entry.kpi_id,
                "kpi_label": entry.kpi_label,
                "formula_description": entry.formula_description,
                "inputs_used": entry.inputs_used,
                "raw_impact": entry.raw_impact,
                "adjusted_impact": entry.adjusted_impact,
                "weighted_impact": entry.weighted_impact,
                "weight": entry.weight,
                "confidence_discount": entry.confidence_discount,
                "category": entry.category,
                "skipped": entry.skipped,
                "skip_reason": entry.skip_reason,
            })

        year_projections = [
            {
                "year": yp.year,
                "realization_percentage": yp.realization_percentage,
                "projected_impact": yp.projected_impact,
                "cumulative_impact": yp.cumulative_impact,
            }
            for yp in sr.year_projections
        ]

        scenarios[scenario.value] = {
            "scenario": scenario.value,
            "total_annual_impact": sr.total_annual_impact,
            "impact_by_category": sr.impact_by_category,
            "year_projections": year_projections,
            "cumulative_3yr_impact": sr.cumulative_3yr_impact,
            "roi_percentage": sr.roi_percentage,
            "kpi_results": kpi_results,
            "skipped_kpis": sr.skipped_kpis,
        }

    return {
        "company_name": result.company_name,
        "industry": result.industry,
        "methodology_id": result.methodology_id,
        "scenarios": scenarios,
        "data_completeness": result.data_completeness,
        "missing_inputs": result.missing_inputs,
        "available_inputs": result.available_inputs,
        "warnings": result.warnings,
    }
```

**Step 4: Run tests to verify they pass**

Run: `source .venv/bin/activate && python -m pytest tests/test_agent_tools.py -v`
Expected: PASS

**Step 5: Commit**

```bash
git add backend/tools/agent_tools.py tests/test_agent_tools.py
git commit -m "feat: rewrite agent tools with @tool decorator for Claude SDK"
```

---

### Task 2: Wire Up the Agentic Orchestrator

**Files:**
- Rewrite: `backend/orchestrator/agent.py`
- Modify: `backend/orchestrator/subagents.py`
- Modify: `backend/orchestrator/system_prompt.py`
- Test: `tests/test_agentic_orchestrator.py`

**Step 1: Write the failing test**

Create `tests/test_agentic_orchestrator.py`:

```python
"""Tests for the agentic orchestrator — mocks the SDK client."""

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.manager import StreamManager


class TestAgenticOrchestrator:

    @pytest.mark.asyncio
    async def test_orchestrator_creates_sdk_client(self):
        """Orchestrator should initialize ClaudeSDKClient with tools."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            # Simulate async context manager
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)

            # Mock the query and response
            mock_msg = MagicMock()
            mock_msg.content = []
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            stream_manager = StreamManager()
            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            # We test that it calls ClaudeSDKClient — actual agent logic is integration-tested
            try:
                await orchestrator.run(
                    company_name="Nike",
                    industry="retail",
                    service_type="experience-transformation-design",
                    case_id="test-123",
                )
            except Exception:
                pass  # May fail on mock iteration, that's OK

            # Verify SDK client was created with options
            MockClient.assert_called_once()
            call_kwargs = MockClient.call_args
            options = call_kwargs[0][0] if call_kwargs[0] else call_kwargs[1].get("options")
            assert options is not None

    @pytest.mark.asyncio
    async def test_orchestrator_registers_cproi_tools(self):
        """Orchestrator should register fetch_financials, run_calculation, load_methodology tools."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            orchestrator = CPROIOrchestrator(stream_manager=StreamManager())
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Check options included our MCP server with tools
            call_args = MockClient.call_args
            options = call_args[0][0] if call_args[0] else call_args[1].get("options")
            allowed = options.allowed_tools
            assert "mcp__cproi__fetch_financials" in allowed
            assert "mcp__cproi__run_calculation" in allowed
            assert "mcp__cproi__load_methodology" in allowed
            # Built-in web search tools
            assert "WebSearch" in allowed
            assert "WebFetch" in allowed

    @pytest.mark.asyncio
    async def test_orchestrator_sends_methodology_driven_prompt(self):
        """The query prompt should include company name, industry, and service type."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            orchestrator = CPROIOrchestrator(stream_manager=StreamManager())
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Verify query was called with a prompt containing the inputs
            query_call = mock_client.query
            query_call.assert_called_once()
            prompt = query_call.call_args[0][0] if query_call.call_args[0] else query_call.call_args[1].get("prompt", "")
            assert "Nike" in prompt
            assert "retail" in prompt
```

**Step 2: Run test to verify it fails**

Run: `source .venv/bin/activate && python -m pytest tests/test_agentic_orchestrator.py -v`
Expected: FAIL — current agent.py doesn't use ClaudeSDKClient

**Step 3: Update system_prompt.py**

Keep `backend/orchestrator/system_prompt.py` mostly as-is but add tool usage instructions:

```python
"""System prompt for the CPROI orchestrator agent."""

ORCHESTRATOR_SYSTEM_PROMPT = """You are the CPROI Orchestrator Agent. Your role is to coordinate the end-to-end
ROI calculation pipeline for client partner engagements.

## Your Tools

- **load_methodology** — Call this FIRST. Returns the methodology config with KPI definitions,
  required input fields, benchmark ranges, and realization curve. This drives everything.
- **fetch_financials** — Fetches company-specific financial data from SEC filings (Valyu) or
  Crunchbase (Firecrawl). Returns populated fields and a list of gaps.
- **scrape_company** — Fallback for private companies if fetch_financials returns no data.
- **WebSearch** — Built-in. Search the web for industry benchmark data to fill gaps.
  Use specific queries like "retail average conversion rate 2024 Baymard Institute".
- **WebFetch** — Built-in. Fetch and read a specific URL found via WebSearch.
- **run_calculation** — Runs the ROI calculation engine against gathered data.
  Returns 3 scenarios with full audit trail.

## Process

1. **Load methodology** — Call load_methodology to get the config for this service type.
   Read the KPI definitions to understand what input fields you need.

2. **Gather financial data** — Call fetch_financials with the company name and industry.
   Review what fields came back and what gaps remain.

3. **Fill gaps with benchmark research** — For each missing field that a KPI needs,
   use WebSearch to find real industry benchmark data. Search for specific, recent,
   authoritative sources (Baymard, McKinsey, Forrester, Statista, etc.).
   When you find a value, note the source URL and date.

4. **Run ROI calculation** — Compile all gathered data (financial + benchmarks) into
   a single company_data dict and call run_calculation. Review the results:
   - Are any KPIs skipped? If so, can you find the missing data?
   - Do the numbers make sense? Flag anything suspicious.
   - Check that total impact is reasonable for the company's revenue.

5. **Generate narrative** — Using the calculation results, write a Situation-Complication-Resolution
   (SCR) narrative that frames the ROI findings. Include:
   - Headline impact number (moderate scenario)
   - Per-KPI breakdown with sources cited
   - 3-year projection using the realization curve
   - Confidence notes where data quality is lower

## Key Principles

- The methodology config drives what data to gather — never hardcode field lists.
- Every number must trace to a source. When using WebSearch benchmarks, cite the URL.
- Prefer company-reported data over benchmarks. Use benchmarks only for gaps.
- If a field can't be found anywhere, skip the KPI gracefully — don't fabricate data.
- Think step by step. After each tool call, reason about what you learned and what to do next.
"""
```

**Step 4: Rewrite agent.py with ClaudeSDKClient**

Rewrite `backend/orchestrator/agent.py`:

```python
"""CPROIOrchestrator — agent-driven ROI pipeline using Claude Agents SDK.

Uses ClaudeSDKClient with custom tools (Valyu, Firecrawl, CalculationEngine)
and built-in tools (WebSearch, WebFetch) to run a methodology-driven pipeline.
"""

from __future__ import annotations

import json
import logging
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

from backend.orchestrator.system_prompt import ORCHESTRATOR_SYSTEM_PROMPT
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

        # Build SSE hook that emits events as tools are called
        async def sse_post_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                _, completed_event = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, completed_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            return {}

        async def sse_pre_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                started_event, _ = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, started_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            return {}

        options = ClaudeAgentOptions(
            system_prompt=ORCHESTRATOR_SYSTEM_PROMPT,
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

        async with ClaudeSDKClient(options) as client:
            await client.query(prompt)

            async for msg in client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            # Collect narrative text from the agent
                            narrative_chunks.append(block.text)
                            await self._emit(case_id, PipelineEventType.NARRATIVE_CHUNK, {
                                "text": block.text,
                            })
                        elif isinstance(block, ToolUseBlock):
                            logger.info(f"Agent calling tool: {block.name}")
                        elif isinstance(block, ToolResultBlock):
                            # Try to extract calculation result
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

        # Emit completion
        narrative = "\n".join(narrative_chunks)
        if narrative:
            await self._emit(case_id, PipelineEventType.NARRATIVE_COMPLETED, {
                "narrative": narrative,
            })

        await self._emit(case_id, PipelineEventType.PIPELINE_COMPLETED, {
            "case_id": case_id,
            "status": "completed",
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
```

**Step 5: Run tests to verify they pass**

Run: `source .venv/bin/activate && python -m pytest tests/test_agentic_orchestrator.py -v`
Expected: PASS

**Step 6: Commit**

```bash
git add backend/orchestrator/agent.py backend/orchestrator/system_prompt.py tests/test_agentic_orchestrator.py
git commit -m "feat: wire orchestrator to Claude Agents SDK with tools and hooks"
```

---

### Task 3: Clean Up Dead Code and Update Imports

**Files:**
- Delete: `backend/orchestrator/data_orchestrator.py`
- Delete: `backend/providers/websearch_provider.py`
- Modify: `backend/providers/__init__.py`
- Modify: `backend/orchestrator/__init__.py`
- Modify: `backend/orchestrator/subagents.py`
- Update: `tests/test_orchestrator.py`
- Delete: `tests/test_websearch_provider.py`
- Modify: `pyproject.toml`

**Step 1: Delete dead files**

```bash
rm backend/orchestrator/data_orchestrator.py
rm backend/providers/websearch_provider.py
rm tests/test_websearch_provider.py
```

**Step 2: Update provider __init__.py**

Modify `backend/providers/__init__.py`:

```python
from .base import ProviderBase
from .valyu_provider import ValyuProvider
from .firecrawl_provider import FirecrawlProvider

__all__ = ["ProviderBase", "ValyuProvider", "FirecrawlProvider"]
```

**Step 3: Update orchestrator __init__.py**

Check current exports and remove DataOrchestrator reference.

**Step 4: Convert subagents.py to AgentDefinition objects**

Modify `backend/orchestrator/subagents.py`:

```python
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
```

**Step 5: Update pyproject.toml to add claude-agent-sdk dependency**

Add `"claude-agent-sdk>=0.1.40"` to the dependencies list in `pyproject.toml`.

**Step 6: Update test_orchestrator.py**

Rewrite `tests/test_orchestrator.py` to test the new agentic orchestrator instead of the deleted DataOrchestrator. Replace all `patch("backend.orchestrator.data_orchestrator.WebSearchProvider")` references with SDK client mocks.

```python
"""Tests for the agentic orchestrator integration."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator, TOOL_EVENT_MAP
from backend.streaming.manager import StreamManager
from backend.streaming.events import PipelineEventType


class TestToolEventMapping:
    """Verify tool-to-SSE-event mapping is correct."""

    def test_fetch_financials_maps_to_data_fetch(self):
        started, completed = TOOL_EVENT_MAP["mcp__cproi__fetch_financials"]
        assert started == PipelineEventType.DATA_FETCH_STARTED
        assert completed == PipelineEventType.DATA_FETCH_COMPLETED

    def test_websearch_maps_to_benchmark(self):
        started, completed = TOOL_EVENT_MAP["WebSearch"]
        assert started == PipelineEventType.BENCHMARK_SEARCH_STARTED
        assert completed == PipelineEventType.BENCHMARK_FOUND

    def test_run_calculation_maps_to_calculation(self):
        started, completed = TOOL_EVENT_MAP["mcp__cproi__run_calculation"]
        assert started == PipelineEventType.CALCULATION_STARTED
        assert completed == PipelineEventType.CALCULATION_COMPLETED

    def test_all_custom_tools_mapped(self):
        """Every custom tool should have an event mapping."""
        assert "mcp__cproi__fetch_financials" in TOOL_EVENT_MAP
        assert "mcp__cproi__scrape_company" in TOOL_EVENT_MAP
        assert "mcp__cproi__run_calculation" in TOOL_EVENT_MAP
        assert "mcp__cproi__load_methodology" in TOOL_EVENT_MAP


class TestOrchestratorConfig:

    @pytest.mark.asyncio
    async def test_stream_manager_receives_pipeline_started(self):
        """When the orchestrator runs, it should emit PIPELINE_STARTED."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            stream_manager = StreamManager()
            events_received: list = []
            original_emit = stream_manager.emit

            async def capture_emit(case_id, event):
                events_received.append(event)
                await original_emit(case_id, event)

            stream_manager.emit = capture_emit

            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            event_types = [e.event_type for e in events_received]
            assert PipelineEventType.PIPELINE_STARTED in event_types
```

**Step 7: Run full test suite**

Run: `source .venv/bin/activate && python -m pytest tests/ -v`
Expected: All tests pass (some old orchestrator tests removed, new ones added)

**Step 8: Commit**

```bash
git add -A
git commit -m "refactor: remove procedural pipeline, wire agent SDK, clean dead code"
```

---

### Task 4: Update FastAPI to Handle Agent Response Format

**Files:**
- Modify: `backend/main.py`
- Test: `tests/test_api.py` (verify existing tests still pass)

**Step 1: Update run_pipeline in main.py**

The orchestrator now returns a `dict` (not `CalculationResult`), so update `run_pipeline`:

```python
async def run_pipeline(case_id: str, company_name: str, industry: str, service_type: str):
    """Background task: run the agentic ROI pipeline and emit SSE events."""
    orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
    try:
        result = await orchestrator.run(
            company_name=company_name,
            industry=industry,
            service_type=service_type,
            case_id=case_id,
        )
        _cases[case_id]["status"] = "completed"
        _cases[case_id]["result"] = result

        # Pipeline completed event is emitted by the orchestrator itself
    except Exception as e:
        logger.exception(f"Pipeline failed for case {case_id}")
        _cases[case_id]["status"] = "error"
        _cases[case_id]["error"] = str(e)

        await stream_manager.emit(case_id, SSEEvent(
            event_type=PipelineEventType.PIPELINE_ERROR,
            data={"case_id": case_id, "error": str(e)},
            sequence_id=999,
        ))
```

**Step 2: Run existing API tests**

Run: `source .venv/bin/activate && python -m pytest tests/test_api.py -v`
Expected: PASS

**Step 3: Commit**

```bash
git add backend/main.py
git commit -m "fix: update main.py for agent dict response format"
```

---

### Task 5: Integration Smoke Test

**Files:**
- Test: `tests/integration/test_agent_pipeline.py`

**Step 1: Write integration test (mocked SDK, real engine)**

```python
"""Integration smoke test — verifies the full pipeline wiring.

Mocks the ClaudeSDKClient but uses real tools, engine, and streaming.
"""

import json
import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from backend.orchestrator.agent import CPROIOrchestrator
from backend.streaming.manager import StreamManager
from backend.streaming.events import PipelineEventType
from backend.tools.agent_tools import load_methodology, run_calculation


class TestPipelineIntegration:

    @pytest.mark.asyncio
    async def test_tools_produce_valid_output(self):
        """Verify our tools produce valid JSON that the engine can consume."""
        # 1. Load methodology
        method_result = await load_methodology({"service_type": "experience-transformation-design"})
        method_data = json.loads(method_result["content"][0]["text"])
        assert "required_inputs" in method_data
        assert len(method_data["kpis"]) >= 5

        # 2. Build company data as if agent gathered it
        company_data = {
            "company_name": "Test Corp",
            "industry": "retail",
            "fields": {
                "annual_revenue": {"value": 500_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "online_revenue": {"value": 200_000_000, "confidence_tier": "company_reported", "confidence_score": 0.95},
                "current_conversion_rate": {"value": 0.025, "confidence_tier": "industry_benchmark", "confidence_score": 0.80},
                "current_aov": {"value": 160.0, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "order_volume": {"value": 1_250_000, "confidence_tier": "estimated", "confidence_score": 0.50},
                "current_churn_rate": {"value": 0.25, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "customer_count": {"value": 1_250_000, "confidence_tier": "estimated", "confidence_score": 0.50},
                "revenue_per_customer": {"value": 400.0, "confidence_tier": "estimated", "confidence_score": 0.50},
                "current_support_contacts": {"value": 2_000_000, "confidence_tier": "estimated", "confidence_score": 0.40},
                "cost_per_contact": {"value": 8.0, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
                "current_nps": {"value": 55, "confidence_tier": "industry_benchmark", "confidence_score": 0.75},
            }
        }

        # 3. Run calculation
        calc_result = await run_calculation({
            "company_data": company_data,
            "service_type": "experience-transformation-design",
        })
        calc_data = json.loads(calc_result["content"][0]["text"])

        assert "scenarios" in calc_data
        moderate = calc_data["scenarios"]["moderate"]
        assert moderate["total_annual_impact"] > 0
        assert len(moderate["kpi_results"]) >= 5
        # No KPIs should be skipped with full data
        skipped = [k for k in moderate["kpi_results"] if k["skipped"]]
        assert len(skipped) == 0

    @pytest.mark.asyncio
    async def test_sse_events_emitted_in_order(self):
        """Verify SSE events fire in the correct order during pipeline run."""
        with patch("backend.orchestrator.agent.ClaudeSDKClient") as MockClient:
            mock_client = AsyncMock()
            MockClient.return_value.__aenter__ = AsyncMock(return_value=mock_client)
            MockClient.return_value.__aexit__ = AsyncMock(return_value=False)
            mock_client.query = AsyncMock()
            mock_client.receive_response = AsyncMock(return_value=AsyncMock(
                __aiter__=lambda self: self,
                __anext__=AsyncMock(side_effect=StopAsyncIteration),
            ))

            events: list[PipelineEventType] = []
            stream_manager = StreamManager()

            async def capture(case_id, event):
                events.append(event.event_type)

            stream_manager.emit = capture

            orchestrator = CPROIOrchestrator(stream_manager=stream_manager)
            try:
                await orchestrator.run("Nike", "retail", "experience-transformation-design", "test-123")
            except Exception:
                pass

            # Pipeline should at minimum emit started and completed
            assert PipelineEventType.PIPELINE_STARTED in events
            assert PipelineEventType.PIPELINE_COMPLETED in events
            # Started should come before completed
            assert events.index(PipelineEventType.PIPELINE_STARTED) < events.index(PipelineEventType.PIPELINE_COMPLETED)
```

**Step 2: Run integration tests**

Run: `source .venv/bin/activate && python -m pytest tests/integration/test_agent_pipeline.py -v`
Expected: PASS

**Step 3: Run full test suite to confirm nothing is broken**

Run: `source .venv/bin/activate && python -m pytest tests/ -v`
Expected: All tests pass

**Step 4: Commit**

```bash
git add tests/integration/test_agent_pipeline.py
git commit -m "test: add integration smoke test for agentic pipeline"
```

---

### Task 6: Manual End-to-End Verification

**Step 1: Restart backend**

```bash
source .venv/bin/activate
# Kill any running backend
lsof -i :8000 -t | xargs kill 2>/dev/null
uvicorn backend.main:app --host 127.0.0.1 --port 8000 &
sleep 2
curl -s http://127.0.0.1:8000/health
```

Expected: `{"status":"ok"}`

**Step 2: Create a test case via curl**

```bash
curl -s -X POST http://127.0.0.1:8000/api/cases \
  -H "Content-Type: application/json" \
  -d '{"company_name":"Nike","industry":"retail","service_type":"experience-transformation-design"}'
```

Expected: `{"case_id":"<uuid>","status":"started"}`

**Step 3: Monitor SSE stream in another terminal**

```bash
curl -N http://127.0.0.1:8000/api/cases/<case_id>/stream
```

Expected: Stream of events showing the agent working:
- `pipeline_started`
- `data_fetch_started` (fetch_financials tool)
- `data_fetch_completed`
- `benchmark_search_started` (WebSearch for gaps)
- `benchmark_found`
- `calculation_started`
- `calculation_completed`
- `narrative_chunk` (multiple)
- `narrative_completed`
- `pipeline_completed`

**Step 4: Verify the result**

```bash
curl -s http://127.0.0.1:8000/api/cases/<case_id> | python3 -m json.tool
```

Expected: Completed case with scenarios, narrative, audit trail.

**Step 5: Test frontend**

Open http://localhost:3000, enter "Nike" / "Retail" / "Experience Transformation & Design", click Go. Verify you see the pipeline steps streaming in real-time.

**Step 6: Final commit**

```bash
git add -A
git commit -m "feat: complete agentic orchestrator with Claude SDK, web search, and streaming"
```
