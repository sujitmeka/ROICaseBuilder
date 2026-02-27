# Fix Pipeline & Redesign UX Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the agent pipeline actually run end-to-end and replace the hardcoded step UI with a real-time "thinking" experience.

**Architecture:** Two-phase fix. Phase 1 removes engineering blockers preventing the agent from running (ImportError, hook types, blocking I/O, data shape mismatch). Phase 2 replaces the cosmetic 6-step checklist with a dynamic activity feed that shows what the agent is actually doing — tool calls, searches, data fetched, reasoning — matching the CLAUDE.md vision of "watching Claude think."

**Tech Stack:** Claude Agent SDK (Python, OAuth via Max subscription), FastAPI SSE, Next.js 15, Zustand, EventSource

---

## Phase 1: Make the Pipeline Actually Run

### Task 1: Fix ImportError from AgentDefinition in subagents.py

The `orchestrator/__init__.py` imports from `subagents.py` which imports `AgentDefinition` from `claude_agent_sdk`. This class may not exist in the SDK, crashing the entire app at import time. Even if it exists, `subagents.py` is dead code — the orchestrator doesn't use subagents (it's a single-agent architecture now).

**Files:**
- Modify: `backend/orchestrator/__init__.py`
- Verify: `backend/orchestrator/subagents.py` (no changes, just confirm dead code)

**Step 1: Verify if AgentDefinition exists in installed SDK**

Run: `cd /Users/sujit/projects/CPROI && .venv/bin/python -c "from claude_agent_sdk import AgentDefinition; print('exists')" 2>&1`
Expected: Either "exists" or ImportError

**Step 2: Remove dead imports from __init__.py**

Regardless of step 1 result, remove the unused imports. Replace `backend/orchestrator/__init__.py` with:

```python
from .agent import CPROIOrchestrator
from .system_prompt import ORCHESTRATOR_SYSTEM_PROMPT

__all__ = [
    "CPROIOrchestrator",
    "ORCHESTRATOR_SYSTEM_PROMPT",
]
```

**Step 3: Verify app imports cleanly**

Run: `.venv/bin/python -c "from backend.orchestrator.agent import CPROIOrchestrator; print('OK')"`
Expected: "OK" with no ImportError

**Step 4: Run existing tests**

Run: `.venv/bin/python -m pytest tests/ -x -q --ignore=tests/test_integration.py 2>&1 | tail -20`
Expected: All tests pass (some may fail if they imported the dead code — fix accordingly)

**Step 5: Commit**

```bash
git add backend/orchestrator/__init__.py
git commit -m "fix: remove dead subagent imports that may cause ImportError"
```

---

### Task 2: Verify SDK Authentication with Max Subscription

The SDK inherits OAuth from `~/.claude/.credentials.json` — no ANTHROPIC_API_KEY needed. But we need to confirm the ClaudeSDKClient actually starts. The CLAUDECODE env var pop (line 160 of agent.py) is critical.

**Files:**
- Verify: `backend/orchestrator/agent.py` (read-only check)
- Create: `tests/test_sdk_auth_smoke.py`

**Step 1: Write a minimal SDK auth smoke test**

```python
"""Smoke test: verify ClaudeSDKClient connects with Max subscription OAuth."""

import asyncio
import os
import pytest
from claude_agent_sdk import ClaudeSDKClient, ClaudeAgentOptions, AssistantMessage, TextBlock


@pytest.mark.integration
async def test_sdk_auth_connects():
    """ClaudeSDKClient should authenticate via OAuth without ANTHROPIC_API_KEY."""
    saved = os.environ.pop("CLAUDECODE", None)
    try:
        options = ClaudeAgentOptions(allowed_tools=[])
        async with ClaudeSDKClient(options=options) as client:
            await client.query("Reply with exactly: PONG")
            response_text = ""
            async for msg in client.receive_response():
                if isinstance(msg, AssistantMessage):
                    for block in msg.content:
                        if isinstance(block, TextBlock):
                            response_text += block.text
            assert "PONG" in response_text
    finally:
        if saved is not None:
            os.environ["CLAUDECODE"] = saved
```

**Step 2: Run the smoke test**

Run: `.venv/bin/python -m pytest tests/test_sdk_auth_smoke.py -v -m integration`
Expected: PASS — confirms SDK works with Max subscription

**Step 3: If it fails, check credentials**

Run: `ls -la ~/.claude/.credentials.json && cat ~/.claude/.credentials.json | head -5`
Expected: File exists with OAuth tokens

**Step 4: Commit**

```bash
git add tests/test_sdk_auth_smoke.py
git commit -m "test: add SDK auth smoke test for Max subscription OAuth"
```

---

### Task 3: Fix Hook Return Types

Both pre/post tool hooks return `{}` which may not satisfy the SDK's `HookJSONOutput` type. The SDK docs don't show explicit return values in hook examples, but returning an empty dict could crash the agent loop.

**Files:**
- Modify: `backend/orchestrator/agent.py:98-116`

**Step 1: Check SDK hook return type expectations**

Run: `.venv/bin/python -c "from claude_agent_sdk.types import HookJSONOutput; print(HookJSONOutput)" 2>&1 || echo "type not found"`

**Step 2: Update hook functions to return None instead of {}**

In `backend/orchestrator/agent.py`, change both hooks to return `None` (the most universally accepted "no-op" return):

```python
        async def sse_post_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                _, completed_event = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, completed_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            return None

        async def sse_pre_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                started_event, _ = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, started_event, {
                    "tool": tool_name,
                    "case_id": case_id,
                })
            return None
```

**Step 3: Run tests**

Run: `.venv/bin/python -m pytest tests/ -x -q --ignore=tests/test_integration.py 2>&1 | tail -20`
Expected: All pass

**Step 4: Commit**

```bash
git add backend/orchestrator/agent.py
git commit -m "fix: hooks return None instead of {} for SDK compatibility"
```

---

### Task 4: Fix Blocking I/O in Async Providers

`valyu_provider.py` and `firecrawl_provider.py` make synchronous HTTP calls inside async functions, blocking the entire event loop (freezes SSE streaming and FastAPI).

**Files:**
- Modify: `backend/providers/valyu_provider.py`
- Modify: `backend/providers/firecrawl_provider.py`

**Step 1: Wrap Valyu's sync calls with asyncio.to_thread and parallelize**

In `valyu_provider.py`, find the loop that makes 6 sequential `self._client.search()` calls and wrap each with `asyncio.to_thread()`, then parallelize with `asyncio.gather()`.

Look for the pattern:
```python
for field_name, query in queries:
    result = self._client.search(query)  # BLOCKING
```

Replace with:
```python
async def _fetch_field(self, field_name: str, query: str):
    result = await asyncio.to_thread(self._client.search, query)
    return field_name, result

results = await asyncio.gather(
    *[self._fetch_field(name, q) for name, q in queries]
)
```

**Step 2: Wrap Firecrawl's sync call**

In `firecrawl_provider.py`, find:
```python
result = self._app.scrape_url(url)  # BLOCKING
```

Replace with:
```python
result = await asyncio.to_thread(self._app.scrape_url, url)
```

**Step 3: Run provider tests**

Run: `.venv/bin/python -m pytest tests/test_valyu_provider.py tests/test_firecrawl_provider.py -v 2>&1 | tail -20`
Expected: All pass

**Step 4: Commit**

```bash
git add backend/providers/valyu_provider.py backend/providers/firecrawl_provider.py
git commit -m "fix: wrap blocking provider I/O with asyncio.to_thread"
```

---

### Task 5: Fix Calculation Result Data Shape Contract

The backend sends `snake_case` fields (`total_annual_impact`, `roi_percentage`, `year_projections` array). The frontend expects `camelCase` (`totalImpact`, `roi`, `revenueAtRisk`, `realization: { year1, year2, year3 }`). This crashes `ResultsLayout` with TypeError.

**The fix:** Align the frontend TypeScript types with the actual backend output. Don't add a transformation layer — let the frontend types match reality.

**Files:**
- Modify: `frontend/src/stores/case-store.ts` (rewrite types)
- Modify: `frontend/src/components/results/ResultsLayout.tsx` (use correct field names)
- Modify: `frontend/src/components/results/HeroMetricBar.tsx` (use correct props)

**Step 1: Rewrite case-store types to match backend output**

Replace the `ScenarioData` and `CalculationResult` interfaces in `case-store.ts`:

```typescript
export interface KpiResult {
  kpi_id: string;
  kpi_label: string;
  formula_description: string;
  inputs_used: Record<string, number>;
  raw_impact: number;
  adjusted_impact: number;
  weighted_impact: number;
  weight: number;
  confidence_discount: number;
  category: string;
  skipped: boolean;
  skip_reason: string | null;
}

export interface YearProjection {
  year: number;
  realization_percentage: number;
  projected_impact: number;
  cumulative_impact: number;
}

export interface ScenarioData {
  scenario: string;
  total_annual_impact: number;
  total_annual_impact_unweighted: number;
  impact_by_category: Record<string, number>;
  year_projections: YearProjection[];
  cumulative_3yr_impact: number;
  roi_percentage: number;
  roi_multiple: number;
  engagement_cost: number;
  kpi_results: KpiResult[];
  skipped_kpis: string[];
}

export interface CalculationResult {
  company_name: string;
  industry: string;
  methodology_id: string;
  methodology_version: string;
  scenarios: Record<Scenario, ScenarioData>;
  data_completeness: number;
  missing_inputs: string[];
  available_inputs: string[];
  warnings: string[];
}
```

**Step 2: Update ResultsLayout to use correct field names**

```typescript
const scenarioData = results.scenarios[activeScenario];
const threeYearCumulative = scenarioData.cumulative_3yr_impact;

// HeroMetricBar props:
<HeroMetricBar
  totalImpact={scenarioData.total_annual_impact}
  roi={scenarioData.roi_percentage}
  roiMultiple={scenarioData.roi_multiple}
  threeYearCumulative={threeYearCumulative}
  scenario={activeScenario}
/>
```

**Step 3: Update HeroMetricBar props**

Remove `revenueAtRisk` prop (doesn't exist in backend), add `roiMultiple`. Update the component interface accordingly.

**Step 4: Build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds with no type errors

**Step 5: Commit**

```bash
git add frontend/src/stores/case-store.ts frontend/src/components/results/ResultsLayout.tsx frontend/src/components/results/HeroMetricBar.tsx
git commit -m "fix: align frontend types with actual backend calculation result shape"
```

---

### Task 6: Fix Result Extraction from Agent Response

The orchestrator tries to find the calculation result by parsing `ToolResultBlock` content. This is fragile. More robust approach: store the result when the `run_calculation` tool is actually invoked (in the post-tool hook).

**Files:**
- Modify: `backend/orchestrator/agent.py`

**Step 1: Capture result in post-tool hook instead of message parsing**

Add a `nonlocal result` capture to the hook. When `mcp__cproi__run_calculation` completes, the tool result is available in the hook's `input_data`:

```python
        result: dict[str, Any] = {}

        async def sse_post_tool_hook(input_data, tool_use_id, context):
            nonlocal result
            tool_name = input_data.get("tool_name", "")
            if tool_name in TOOL_EVENT_MAP:
                _, completed_event = TOOL_EVENT_MAP[tool_name]
                await self._emit(case_id, completed_event, {
                    "tool": tool_name,
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
```

**Step 2: Keep the message-stream parsing as fallback**

Leave the existing `ToolResultBlock` parsing in the receive_response loop as a fallback, but the hook-based capture should be the primary mechanism.

**Step 3: Run tests**

Run: `.venv/bin/python -m pytest tests/ -x -q --ignore=tests/test_integration.py 2>&1 | tail -20`
Expected: All pass

**Step 4: Commit**

```bash
git add backend/orchestrator/agent.py
git commit -m "fix: capture calculation result in post-tool hook for reliable extraction"
```

---

### Task 7: Surface Pipeline Errors to the User

Currently `pipeline_error` discards the error message and the user sees nothing.

**Files:**
- Modify: `frontend/src/stores/stream-store.ts` (add error field)
- Modify: `frontend/src/hooks/use-event-stream.ts` (store error message)
- Modify: `frontend/src/app/cases/[caseId]/page.tsx` (render error)

**Step 1: Add error field to stream store**

In `stream-store.ts`, add to interface and initial state:

```typescript
error: string | null;
setError: (error: string | null) => void;
```

Initialize: `error: null` and `setError: (error) => set({ error })`

**Step 2: Store error in useEventStream**

In the `pipeline_error` case of `use-event-stream.ts`:

```typescript
case "pipeline_error": {
    const errorMsg = (event.payload.error as string) ?? "Analysis failed. Please try again.";
    const setError = useStreamStore.getState().setError;
    setError(errorMsg);
    esRef.current?.close();
    setConnectionStatus("disconnected");
    return;
}
```

**Step 3: Render error in case page**

In `cases/[caseId]/page.tsx`, read error from store and show it:

```typescript
const error = useStreamStore((s) => s.error);

// After the connection status text, add:
{error && (
    <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4">
        <p className="text-red-800 text-sm font-medium">Analysis Error</p>
        <p className="text-red-600 text-sm mt-1">{error}</p>
    </div>
)}
```

**Step 4: Build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/stores/stream-store.ts frontend/src/hooks/use-event-stream.ts frontend/src/app/cases/\\[caseId\\]/page.tsx
git commit -m "fix: surface pipeline errors to user instead of silently swallowing"
```

---

## Phase 2: Redesign UX for "Thinking" Experience

### Task 8: Add Agent Activity Event Types to Backend

The backend needs to emit events for agent reasoning, not just tool start/stop. Add new event types and emit them from the orchestrator.

**Files:**
- Modify: `backend/streaming/events.py` (add event types)
- Modify: `backend/orchestrator/agent.py` (emit thinking events)

**Step 1: Add new event types**

In `events.py`, add to `PipelineEventType`:

```python
    # Agent activity (for "thinking" UX)
    AGENT_THINKING = "agent_thinking"
    TOOL_CALL_STARTED = "tool_call_started"
    TOOL_CALL_COMPLETED = "tool_call_completed"
    DATA_POINT_FOUND = "data_point_found"
```

**Step 2: Emit agent thinking events from orchestrator**

In `agent.py`, when processing `TextBlock` from the agent, emit `AGENT_THINKING` with the text BEFORE it becomes narrative (narrative chunks are the final output; thinking happens during tool-calling turns too):

```python
if isinstance(block, TextBlock):
    narrative_chunks.append(block.text)
    # Emit as both thinking (for activity feed) and narrative chunk
    await self._emit(case_id, PipelineEventType.AGENT_THINKING, {
        "text": block.text,
    })
    await self._emit(case_id, PipelineEventType.NARRATIVE_CHUNK, {
        "text": block.text,
    })
```

**Step 3: Emit rich tool call events from hooks**

Update the pre-tool hook to emit `TOOL_CALL_STARTED` with the tool input for display:

```python
        async def sse_pre_tool_hook(input_data, tool_use_id, context):
            tool_name = input_data.get("tool_name", "")
            tool_input = input_data.get("tool_input", {})
            # Emit generic tool call event (for activity feed)
            await self._emit(case_id, PipelineEventType.TOOL_CALL_STARTED, {
                "tool": tool_name,
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
```

Add helper function:

```python
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
```

**Step 4: Run tests**

Run: `.venv/bin/python -m pytest tests/ -x -q --ignore=tests/test_integration.py 2>&1 | tail -20`
Expected: All pass

**Step 5: Commit**

```bash
git add backend/streaming/events.py backend/orchestrator/agent.py
git commit -m "feat: emit agent thinking and tool call events for real-time activity feed"
```

---

### Task 9: Replace Hardcoded Pipeline Steps with Dynamic Activity Feed

Replace the static 6-step `PipelineTimeline` with a dynamic activity log. Each backend event becomes a timestamped entry.

**Files:**
- Create: `frontend/src/stores/activity-store.ts`
- Modify: `frontend/src/hooks/use-event-stream.ts` (feed activity store)
- Create: `frontend/src/components/streaming/ActivityFeed.tsx`
- Create: `frontend/src/components/streaming/ActivityEntry.tsx`
- Modify: `frontend/src/app/cases/[caseId]/page.tsx` (use ActivityFeed)

**Step 1: Create activity store**

```typescript
// frontend/src/stores/activity-store.ts
import { create } from "zustand";

export type ActivityType =
  | "thinking"      // Agent reasoning text
  | "tool_start"    // Tool call initiated
  | "tool_complete" // Tool call finished
  | "data_found"    // Data point discovered
  | "search"        // Web search query
  | "milestone"     // Pipeline stage reached
  | "error";        // Something went wrong

export interface ActivityEntry {
  id: string;
  type: ActivityType;
  timestamp: string;
  title: string;         // Short label: "Searching for benchmarks"
  detail?: string;       // Longer text: agent reasoning or search query
  tool?: string;         // Tool name if applicable
  status?: "running" | "done" | "error";
}

interface ActivityStore {
  entries: ActivityEntry[];
  addEntry: (entry: ActivityEntry) => void;
  updateEntry: (id: string, updates: Partial<ActivityEntry>) => void;
  reset: () => void;
}

export const useActivityStore = create<ActivityStore>((set) => ({
  entries: [],
  addEntry: (entry) => set((s) => ({ entries: [...s.entries, entry] })),
  updateEntry: (id, updates) =>
    set((s) => ({
      entries: s.entries.map((e) => (e.id === id ? { ...e, ...updates } : e)),
    })),
  reset: () => set({ entries: [] }),
}));
```

**Step 2: Wire useEventStream to feed activity store**

In `use-event-stream.ts`, add activity store imports and map ALL event types to activity entries. Keep the existing step mapping for backward compatibility but ADD activity entries:

```typescript
import { useActivityStore } from "../stores/activity-store";

// Inside useEffect, after handleEvent function:
const addActivity = useActivityStore.getState().addEntry;
const updateActivity = useActivityStore.getState().updateEntry;

// In handleEvent, before the switch:
const activityId = `${event.type}-${event.timestamp}`;

// Add cases for new event types:
case "agent_thinking":
    addActivity({
        id: activityId,
        type: "thinking",
        timestamp: event.timestamp,
        title: "Agent reasoning",
        detail: event.payload.text as string,
    });
    break;

case "tool_call_started":
    addActivity({
        id: `tool-${event.payload.tool}`,
        type: "tool_start",
        timestamp: event.timestamp,
        title: event.payload.input_summary as string,
        tool: event.payload.tool as string,
        status: "running",
    });
    break;

case "tool_call_completed":
    updateActivity(`tool-${event.payload.tool}`, { status: "done" });
    break;
```

**Step 3: Build ActivityFeed and ActivityEntry components**

Build with the `frontend-design` skill for high design quality — these are the core "watching Claude think" components. The feed should:
- Auto-scroll to latest entry
- Show a pulsing indicator on running items
- Collapse agent thinking text to first line with expand
- Show tool names with icons (search icon for WebSearch, database icon for fetch_financials, etc.)
- Timestamp each entry relatively ("3s ago")

**Step 4: Update case page to use ActivityFeed**

Replace `<PipelineTimeline steps={pipelineSteps} />` with `<ActivityFeed />`. Keep a small progress summary bar at the top showing overall status.

**Step 5: Build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add frontend/src/stores/activity-store.ts frontend/src/components/streaming/ActivityFeed.tsx frontend/src/components/streaming/ActivityEntry.tsx frontend/src/hooks/use-event-stream.ts frontend/src/app/cases/\\[caseId\\]/page.tsx
git commit -m "feat: replace hardcoded pipeline steps with dynamic agent activity feed"
```

---

### Task 10: Fix Narrative Streaming and Visual Bugs

**Files:**
- Modify: `frontend/src/components/streaming/NarrativeStream.tsx`
- Modify: `frontend/src/app/cases/[caseId]/page.tsx`
- Modify: `frontend/src/stores/stream-store.ts` (reset on new case)
- Modify: `frontend/src/stores/case-store.ts` (reset on new case)

**Step 1: Fix permanent blinking cursor**

In `NarrativeStream.tsx`, accept a `streaming` prop and only show cursor when actively streaming:

```typescript
interface Props {
  text: string;
  streaming?: boolean;
}

// Only show cursor when streaming:
{streaming && (
    <span className="inline-block w-2 h-4 bg-blue-500 animate-pulse ml-0.5" />
)}
```

**Step 2: Render narrative as markdown**

Replace plain text with whitespace-preserved rendering:

```typescript
<div
    ref={containerRef}
    className="prose prose-sm max-h-96 overflow-y-auto whitespace-pre-wrap"
>
    {text}
    {streaming && <span className="..." />}
</div>
```

**Step 3: Show company name on case page**

In `cases/[caseId]/page.tsx`, read company name from case store and display:

```typescript
const companyName = useCaseStore((s) => s.companyName);

<h1 className="text-2xl font-semibold text-gray-900">
    {companyName ? `Analyzing ${companyName}` : "Analyzing ROI Case"}
</h1>
```

Wire `companyName` from the `pipeline_started` event payload in `useEventStream`:

```typescript
case "pipeline_started":
    setConnectionStatus("connected");
    if (event.payload.company_name) {
        useCaseStore.getState().setCaseInfo({
            caseId: caseId!,
            companyName: event.payload.company_name as string,
            industry: event.payload.industry as string ?? "",
            serviceType: event.payload.service_type as string ?? "",
        });
    }
    return;
```

**Step 4: Reset stores between cases**

Add `reset()` methods to both stores. Call them in `useEventStream`'s effect setup:

```typescript
// At the start of the useEffect in useEventStream:
useActivityStore.getState().reset();
useCaseStore.getState().reset();
useStreamStore.getState().reset();
```

**Step 5: Build and verify**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 6: Commit**

```bash
git add frontend/src/components/streaming/NarrativeStream.tsx frontend/src/app/cases/\\[caseId\\]/page.tsx frontend/src/stores/stream-store.ts frontend/src/stores/case-store.ts frontend/src/stores/activity-store.ts frontend/src/hooks/use-event-stream.ts
git commit -m "fix: narrative cursor, company name display, store reset between cases"
```

---

### Task 11: Add Error Boundaries and Connection Resilience

**Files:**
- Create: `frontend/src/app/cases/[caseId]/error.tsx`
- Create: `frontend/src/app/cases/[caseId]/loading.tsx`
- Modify: `frontend/src/lib/sse-client.ts` (add reconnect with backoff)

**Step 1: Create error boundary**

```typescript
// frontend/src/app/cases/[caseId]/error.tsx
"use client";

export default function CaseError({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="max-w-md text-center">
                <h2 className="text-xl font-semibold text-gray-900">Something went wrong</h2>
                <p className="mt-2 text-gray-500">{error.message}</p>
                <button
                    onClick={reset}
                    className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                    Try again
                </button>
            </div>
        </main>
    );
}
```

**Step 2: Create loading state**

```typescript
// frontend/src/app/cases/[caseId]/loading.tsx
export default function CaseLoading() {
    return (
        <main className="min-h-screen bg-gray-50 flex items-center justify-center">
            <div className="text-center">
                <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
                <p className="mt-4 text-gray-500">Loading analysis...</p>
            </div>
        </main>
    );
}
```

**Step 3: Add SSE reconnection with timeout**

In `sse-client.ts`, add a connection timeout (30s) so users aren't stuck on "Connecting..." forever:

```typescript
export function createSSEConnection(
    caseId: string,
    onEvent: (event: SSEEvent) => void,
    onError: (error: Event) => void,
    timeoutMs = 30_000
): EventSource {
    const es = new EventSource(`/api/cases/${caseId}/stream`);
    let receivedFirstEvent = false;

    const timeout = setTimeout(() => {
        if (!receivedFirstEvent) {
            es.close();
            onError(new Event("timeout"));
        }
    }, timeoutMs);

    es.onmessage = (event) => {
        receivedFirstEvent = true;
        clearTimeout(timeout);
        try {
            const raw = JSON.parse(event.data);
            const { type, timestamp, ...rest } = raw;
            onEvent({ type, timestamp, payload: rest });
        } catch {
            // skip malformed events
        }
    };

    es.onerror = (err) => {
        clearTimeout(timeout);
        onError(err);
    };

    return es;
}
```

**Step 4: Build frontend**

Run: `cd frontend && npm run build 2>&1 | tail -20`
Expected: Build succeeds

**Step 5: Commit**

```bash
git add frontend/src/app/cases/\\[caseId\\]/error.tsx frontend/src/app/cases/\\[caseId\\]/loading.tsx frontend/src/lib/sse-client.ts
git commit -m "feat: add error boundaries, loading states, SSE connection timeout"
```

---

## Verification Checklist

After all tasks, run these checks:

1. **Backend starts:** `cd /Users/sujit/projects/CPROI && .venv/bin/python -m uvicorn backend.main:app --port 8000`
2. **Frontend builds:** `cd frontend && npm run build`
3. **Tests pass:** `.venv/bin/python -m pytest tests/ -x -q --ignore=tests/test_integration.py`
4. **End-to-end smoke:** Submit a company via the UI, verify:
   - Activity feed shows real-time agent actions
   - Agent reasoning text appears ("thinking")
   - Tool calls are visible with human-readable summaries
   - Narrative streams progressively
   - Results page renders with correct numbers
   - Error state shows if pipeline fails
5. **No regressions:** `cd frontend && npm run build && npm run lint`
