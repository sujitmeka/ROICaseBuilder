/**
 * CPROIOrchestrator — TypeScript port of the agentic ROI pipeline.
 *
 * Uses the Claude Agent SDK's `query()` async generator with custom MCP tools
 * (Valyu, Firecrawl, CalculationEngine) and built-in tools (WebSearch, WebFetch)
 * to run a methodology-driven pipeline. Emits SSE events via callback so the
 * Next.js API route can stream progress to the frontend.
 */

import {
  query,
  type HookInput,
  type HookJSONOutput,
  type SDKMessage,
  type SDKAssistantMessage,
  type SDKResultMessage,
  type PreToolUseHookInput,
  type PostToolUseHookInput,
} from "@anthropic-ai/claude-agent-sdk";
import { createCproiToolServer } from "./tools";

// ---------------------------------------------------------------------------
// SSE Event Types (must match frontend expectations)
// ---------------------------------------------------------------------------

export type PipelineEventType =
  | "pipeline_started"
  | "pipeline_completed"
  | "pipeline_error"
  | "company_identified"
  | "data_fetch_started"
  | "data_fetch_completed"
  | "benchmark_search_started"
  | "benchmark_found"
  | "calculation_started"
  | "calculation_completed"
  | "narrative_chunk"
  | "narrative_completed"
  | "agent_thinking"
  | "tool_call_started"
  | "tool_call_completed";

export interface SSEEvent {
  type: PipelineEventType;
  timestamp: string;
  [key: string]: unknown;
}

// ---------------------------------------------------------------------------
// Tool-to-Event Mapping (mirrors Python TOOL_EVENT_MAP)
// ---------------------------------------------------------------------------

const TOOL_EVENT_MAP: Record<string, [PipelineEventType, PipelineEventType]> = {
  "mcp__cproi-tools__load_methodology": ["pipeline_started", "company_identified"],
  "mcp__cproi-tools__fetch_financials": ["data_fetch_started", "data_fetch_completed"],
  "mcp__cproi-tools__scrape_company": ["data_fetch_started", "data_fetch_completed"],
  WebSearch: ["benchmark_search_started", "benchmark_found"],
  WebFetch: ["benchmark_search_started", "benchmark_found"],
  "mcp__cproi-tools__run_calculation": ["calculation_started", "calculation_completed"],
};

// ---------------------------------------------------------------------------
// Tool input summary helper (for activity feed)
// ---------------------------------------------------------------------------

function summarizeToolInput(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  if (toolName.includes("fetch_financials"))
    return `Fetching financial data for ${(toolInput.company_name as string) ?? "company"}`;
  if (toolName.includes("scrape_company"))
    return `Scraping company data for ${(toolInput.company_name as string) ?? "company"}`;
  if (toolName.includes("run_calculation"))
    return "Running ROI calculation engine";
  if (toolName.includes("load_methodology"))
    return `Loading methodology for ${(toolInput.service_type as string) ?? "service"}`;
  if (toolName === "WebSearch")
    return `Searching: ${String(toolInput.query ?? "").slice(0, 80)}`;
  if (toolName === "WebFetch")
    return `Reading: ${String(toolInput.url ?? "").slice(0, 80)}`;
  return `Using ${toolName}`;
}

// ---------------------------------------------------------------------------
// System Prompt (ported from Python, with dynamic date injection)
// ---------------------------------------------------------------------------

function getSystemPrompt(): string {
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear();

  return `You are the CPROI Orchestrator Agent. Your role is to coordinate the end-to-end
ROI calculation pipeline for client partner engagements.

## Important Context

Today's date is ${today}. Always search for the most recent data available (prefer ${year}
or ${year - 1} data). Do not search for or cite outdated data from earlier years unless
no recent data exists.

## Your Tools

- **load_methodology** — Call this FIRST. Returns the methodology config with KPI definitions,
  required input fields, benchmark ranges, and realization curve. This drives everything.
- **fetch_financials** — Fetches company-specific financial data from SEC filings (Valyu) or
  Crunchbase (Firecrawl). Returns populated fields and a list of gaps.
- **scrape_company** — Fallback for private companies if fetch_financials returns no data.
- **WebSearch** — Built-in. Search the web for industry benchmark data to fill gaps.
  Use specific queries like "retail average conversion rate ${year} Baymard Institute".
- **WebFetch** — Built-in. Fetch and read a specific URL found via WebSearch.
- **run_calculation** — Runs the ROI calculation engine against gathered data.
  Pass company_data as a nested object with company_name, industry, and fields.
  Each field should be an object with value, confidence_tier, and confidence_score.
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
   a single company_data object and call run_calculation. The company_data parameter
   must be a JSON object (not a string) with this structure:
   {"company_name": "...", "industry": "...", "fields": {"field_name": {"value": 123, "confidence_tier": "company_reported", "confidence_score": 0.95}}}
   Review the results:
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
`;
}

// ---------------------------------------------------------------------------
// Orchestrator result interface
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  scenarios: Record<string, unknown>;
  narrative: string;
  caseId: string;
}

// ---------------------------------------------------------------------------
// Main pipeline runner
// ---------------------------------------------------------------------------

export async function runPipeline(params: {
  companyName: string;
  industry: string;
  serviceType: string;
  caseId: string;
  onEvent: (event: SSEEvent) => void;
}): Promise<OrchestratorResult> {
  const { companyName, industry, serviceType, caseId, onEvent } = params;

  // Helper to emit SSE events
  function emit(type: PipelineEventType, data: Record<string, unknown> = {}): void {
    onEvent({
      type,
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  // Mutable state captured by hooks and the message loop
  let scenarios: Record<string, unknown> = {};
  const narrativeChunks: string[] = [];

  // Build MCP server with custom tools
  const cproiServer = createCproiToolServer();

  // -----------------------------------------------------------------------
  // Pre-tool hook: emit tool_call_started + specific pipeline event
  // -----------------------------------------------------------------------
  async function preToolHook(
    input: HookInput,
    toolUseId: string | undefined,
    _options: { signal: AbortSignal },
  ): Promise<HookJSONOutput> {
    const hookInput = input as PreToolUseHookInput;
    const toolName = hookInput.tool_name;
    const toolInput = (hookInput.tool_input ?? {}) as Record<string, unknown>;

    // Emit generic tool_call_started (powers the activity feed)
    emit("tool_call_started", {
      tool: toolName,
      tool_use_id: toolUseId ?? null,
      input_summary: summarizeToolInput(toolName, toolInput),
      case_id: caseId,
    });

    // Emit specific pipeline step event (e.g. data_fetch_started)
    if (toolName in TOOL_EVENT_MAP) {
      const [startedEvent] = TOOL_EVENT_MAP[toolName];
      emit(startedEvent, {
        tool: toolName,
        case_id: caseId,
      });
    }

    return {};
  }

  // -----------------------------------------------------------------------
  // Post-tool hook: emit specific completed event + tool_call_completed,
  //                 capture calculation result
  // -----------------------------------------------------------------------
  async function postToolHook(
    input: HookInput,
    toolUseId: string | undefined,
    _options: { signal: AbortSignal },
  ): Promise<HookJSONOutput> {
    const hookInput = input as PostToolUseHookInput;
    const toolName = hookInput.tool_name;

    // Emit specific pipeline step completed event
    if (toolName in TOOL_EVENT_MAP) {
      const [, completedEvent] = TOOL_EVENT_MAP[toolName];
      emit(completedEvent, {
        tool: toolName,
        case_id: caseId,
      });
    }

    // Emit generic tool_call_completed
    emit("tool_call_completed", {
      tool: toolName,
      tool_use_id: toolUseId ?? null,
      case_id: caseId,
    });

    // Capture calculation result from run_calculation tool output
    if (toolName === "mcp__cproi-tools__run_calculation") {
      const toolResult = hookInput.tool_response;
      try {
        let parsed: Record<string, unknown> | undefined;
        if (typeof toolResult === "string") {
          parsed = JSON.parse(toolResult) as Record<string, unknown>;
        } else if (typeof toolResult === "object" && toolResult !== null) {
          parsed = toolResult as Record<string, unknown>;
        }
        if (parsed && "scenarios" in parsed) {
          scenarios = parsed;
        }
      } catch {
        // Ignore parse failures — the agent may still produce the result via text
      }
    }

    return {};
  }

  // -----------------------------------------------------------------------
  // Emit pipeline_started
  // -----------------------------------------------------------------------
  emit("pipeline_started", {
    company_name: companyName,
    industry,
    service_type: serviceType,
  });

  // Build the user prompt with the system prompt embedded.
  // The SDK's query() function does not have a separate systemPrompt option;
  // instead, we prepend the system instructions to the user prompt.
  const systemPrompt = getSystemPrompt();
  const userTask =
    `Analyze the ROI case for ${companyName} in the ${industry} industry ` +
    `using the ${serviceType} methodology.\n\n` +
    `Follow your process: load the methodology first, then gather financial ` +
    `data, fill gaps with web search benchmarks, run the calculation, and ` +
    `generate the SCR narrative. Think carefully at each step.`;

  const prompt = `${systemPrompt}\n---\n\n${userTask}`;

  // -----------------------------------------------------------------------
  // Run the agent loop
  // -----------------------------------------------------------------------
  try {
    const agentStream = query({
      prompt,
      options: {
        mcpServers: { "cproi-tools": cproiServer },
        allowedTools: [
          "mcp__cproi-tools__load_methodology",
          "mcp__cproi-tools__fetch_financials",
          "mcp__cproi-tools__scrape_company",
          "mcp__cproi-tools__run_calculation",
          "WebSearch",
          "WebFetch",
        ],
        tools: [
          "WebSearch",
          "WebFetch",
        ],
        hooks: {
          PreToolUse: [{ hooks: [preToolHook] }],
          PostToolUse: [{ hooks: [postToolHook] }],
        },
        maxTurns: 20,
        permissionMode: "bypassPermissions",
        allowDangerouslySkipPermissions: true,
        persistSession: false,
        env: {
          ...process.env as Record<string, string | undefined>,
          CLAUDE_AGENT_SDK_CLIENT_APP: "cproi/1.0.0",
        },
      },
    });

    for await (const message of agentStream) {
      processMessage(message, caseId, narrativeChunks, emit);
    }
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : "Unknown pipeline error";
    emit("pipeline_error", {
      error: errorMessage,
      case_id: caseId,
    });
    throw error;
  }

  // -----------------------------------------------------------------------
  // Emit completion events
  // -----------------------------------------------------------------------
  const narrative = narrativeChunks.join("\n");
  if (narrative) {
    emit("narrative_completed", { narrative });
  }

  emit("pipeline_completed", {
    case_id: caseId,
    status: "completed",
    result: Object.keys(scenarios).length > 0 ? scenarios : null,
  });

  return {
    scenarios,
    narrative,
    caseId,
  };
}

// ---------------------------------------------------------------------------
// Message processing helper
// ---------------------------------------------------------------------------

function processMessage(
  message: SDKMessage,
  caseId: string,
  narrativeChunks: string[],
  emit: (type: PipelineEventType, data?: Record<string, unknown>) => void,
): void {
  // Assistant messages contain text blocks (narrative/thinking) and tool_use blocks
  if (message.type === "assistant") {
    const assistantMsg = message as SDKAssistantMessage;
    const content = assistantMsg.message?.content;
    if (Array.isArray(content)) {
      for (const block of content) {
        if (block.type === "text") {
          const text = (block as { type: "text"; text: string }).text;
          narrativeChunks.push(text);
          emit("agent_thinking", { text, case_id: caseId });
          emit("narrative_chunk", { text, case_id: caseId });
        }
        // tool_use blocks are handled by the hooks; we just log here
      }
    }
    return;
  }

  // Result messages signal pipeline end
  if (message.type === "result") {
    const resultMsg = message as SDKResultMessage;
    if (resultMsg.subtype === "success") {
      // The result text may contain the final narrative or calculation JSON
      if ("result" in resultMsg && typeof resultMsg.result === "string") {
        try {
          const parsed = JSON.parse(resultMsg.result) as Record<string, unknown>;
          if ("scenarios" in parsed) {
            // Late capture — in case hooks missed it
            emit("calculation_completed", {
              case_id: caseId,
              result: parsed,
            });
          }
        } catch {
          // Result is plain text, not JSON — that's fine
        }
      }
    } else {
      // Error result
      emit("pipeline_error", {
        error: `Agent stopped: ${resultMsg.subtype}`,
        stop_reason: resultMsg.stop_reason ?? null,
        case_id: caseId,
      });
    }
    return;
  }

  // Other message types (stream_event, system, etc.) are ignored for now
}
