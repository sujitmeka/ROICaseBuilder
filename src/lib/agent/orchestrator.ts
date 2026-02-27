/**
 * CPROIOrchestrator — Agentic ROI pipeline using Vercel AI SDK streamText().
 *
 * Replaces the manual tool-use loop with streamText() + stopWhen(stepCountIs(20)).
 * Emits custom data parts (data-activity, data-pipeline) via createUIMessageStream
 * so the frontend can show real-time progress alongside the streamed LLM output.
 */

import { streamText, stepCountIs, createUIMessageStream } from "ai";
import { pipeJsonRender } from "@json-render/core";
import { anthropic } from "@ai-sdk/anthropic";
import { tools } from "./tools";
import { catalog } from "../ui/catalog";

// ---------------------------------------------------------------------------
// Custom data part types (must match frontend expectations)
// ---------------------------------------------------------------------------

export interface ActivityDataPart {
  type: "data-activity";
  id: string;
  data: {
    activityType: "tool_start" | "tool_complete" | "milestone" | "error";
    title: string;
    tool?: string;
    status: "running" | "done" | "error";
  };
}

export interface PipelineDataPart {
  type: "data-pipeline";
  id: string;
  data: {
    stepId: string;
    status: "active" | "completed";
    message?: string;
  };
}

// ---------------------------------------------------------------------------
// Tool-to-Step Mapping (maps tool names to pipeline step IDs for frontend)
// ---------------------------------------------------------------------------

const TOOL_STEP_MAP: Record<string, string> = {
  load_methodology: "classify",
  fetch_financials: "financials",
  scrape_company: "financials",
  web_search: "benchmarks",
  run_calculation: "calculate",
};

// ---------------------------------------------------------------------------
// Human-readable tool summaries
// ---------------------------------------------------------------------------

function summarizeToolCall(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "fetch_financials":
      return `Fetching financial data for ${(args.company_name as string) ?? "company"}`;
    case "scrape_company":
      return `Scraping company data for ${(args.company_name as string) ?? "company"}`;
    case "run_calculation":
      return "Running ROI calculation engine";
    case "load_methodology":
      return `Loading methodology for ${(args.service_type as string) ?? "service"}`;
    case "web_search":
      return "Searching the web";
    default:
      return `Using ${toolName}`;
  }
}

// ---------------------------------------------------------------------------
// System Prompt
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
- **web_search** — Search the web for industry benchmark data to fill gaps.
  Use specific queries like "retail average conversion rate ${year} Baymard Institute".
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
   use web_search to find real industry benchmark data. Search for specific, recent,
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

5. **Generate structured output** — Using the calculation results, generate your final output
   using the UI component system described below. Write a brief 1-2 sentence summary, then
   output ALL UI components as JSONL patches inside a single \`\`\`spec code fence.
   Do NOT use plain markdown for the final output — use the component system.

   Inside the \`\`\`spec fence, follow this exact order:
   - Start with exactly ONE ROIStatement (the hero one-liner with investment, impact, and ROI multiple)
   - Then a NarrativeBlock with heading "Executive Summary" (2-3 sentence SCR framing)
   - Then MetricCards for each non-skipped KPI, ordered by impact (highest first)
   - Then a NarrativeBlock with heading "3-Year Outlook" (1-2 sentences)
   - Then 3 ProjectionRows (Year 1, Year 2, Year 3) with realization curve data
   - Then ConfidenceNotes for any medium/low confidence data sources
   - Finally SkippedKPIs for any KPIs that couldn't be calculated

   Keep ALL text concise and copy-pasteable. These outputs will be pasted into client slide decks.
   NarrativeBlock bodies should be 2-3 sentences maximum. Format all dollar values compactly
   ($4.2M, $350K). Format percentages without decimals where possible.

## Key Principles

- The methodology config drives what data to gather — never hardcode field lists.
- Every number must trace to a source. When using web_search benchmarks, cite the URL.
- Prefer company-reported data over benchmarks. Use benchmarks only for gaps.
- If a field can't be found anywhere, skip the KPI gracefully — don't fabricate data.
- Think step by step. After each tool call, reason about what you learned and what to do next.

## UI Component System

${catalog.prompt({
  mode: "chat",
  customRules: [
    "Always start with exactly ONE ROIStatement component.",
    "Follow with MetricCards ordered by impact (highest dollar impact first).",
    "Use NarrativeBlock sparingly — only for Executive Summary and 3-Year Outlook headings.",
    "Generate exactly 3 ProjectionRows for the 3-year outlook.",
    "Add ConfidenceNotes for any data points with medium or low confidence.",
    "Add SkippedKPIs at the end for any KPIs that were skipped.",
    "Format all currency values compactly: $4.2M, $350K, $1.2B.",
    "Format percentages without unnecessary decimals: 35%, 2.1%.",
    "Keep NarrativeBlock body text to 2-3 sentences maximum.",
    "Every MetricCard must include a real source — never fabricate sources.",
    "Output ALL components in a single ```spec fence — do NOT split across multiple fences.",
    "The ```spec fence should be your FINAL output after all tool calls are complete.",
  ],
})}
`;
}

// ---------------------------------------------------------------------------
// Orchestrator result (for Supabase persistence)
// ---------------------------------------------------------------------------

export interface OrchestratorResult {
  scenarios: Record<string, unknown>;
  narrative: string;
  caseId: string;
}

// ---------------------------------------------------------------------------
// Main pipeline — returns a UIMessageStream + a result promise
// ---------------------------------------------------------------------------

export function createPipelineStream(params: {
  companyName: string;
  industry: string;
  serviceType: string;
  caseId: string;
}): {
  stream: ReadableStream;
  resultPromise: Promise<OrchestratorResult>;
} {
  const { companyName, industry, serviceType, caseId } = params;

  // Deferred promise — resolved when stream completes, rejected on error.
  // The route awaits this to persist results to Supabase.
  // Using manual pattern for Node 20 compatibility (Promise.withResolvers requires Node 22+).
  let resolveResult: (value: OrchestratorResult) => void;
  let rejectResult: (reason: Error) => void;
  const resultPromise = new Promise<OrchestratorResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const userTask =
    `Analyze the ROI case for ${companyName} in the ${industry} industry ` +
    `using the ${serviceType} methodology.\n\n` +
    `Follow your process: load the methodology first, then gather financial ` +
    `data, fill gaps with web search benchmarks, run the calculation, and ` +
    `generate the SCR narrative. Think carefully at each step.`;

  let scenarios: Record<string, unknown> = {};
  let benchmarksStarted = false;

  const stream = createUIMessageStream({
    execute: async ({ writer }) => {
      try {
        // Emit case info so the frontend can show "Analyzing Nike"
        writer.write({
          type: "data-caseinfo",
          id: "case-info",
          data: { companyName, industry, serviceType, caseId },
        });

        // Emit pipeline started
        writer.write({
          type: "data-activity",
          id: "pipeline-started",
          data: {
            activityType: "milestone",
            title: "Analysis pipeline started",
            status: "running",
          },
        } as ActivityDataPart);

        writer.write({
          type: "data-pipeline",
          id: "step-classify",
          data: { stepId: "classify", status: "active" },
        } as PipelineDataPart);

        const result = streamText({
          model: anthropic("claude-sonnet-4-5-20250929"),
          system: getSystemPrompt(),
          messages: [{ role: "user", content: userTask }],
          tools: {
            ...tools,
            web_search: anthropic.tools.webSearch_20250305({ maxUses: 10 }),
          },
          stopWhen: stepCountIs(20),
          maxOutputTokens: 8192,

          experimental_onToolCallStart({ toolCall }) {
            const toolName = toolCall.toolName;
            const args = (toolCall.input ?? {}) as Record<string, unknown>;
            const stepId = TOOL_STEP_MAP[toolName];
            const toolCallId = `tool-${toolName}-${Date.now()}`;

            // Emit tool start activity
            writer.write({
              type: "data-activity",
              id: toolCallId,
              data: {
                activityType: "tool_start",
                title: summarizeToolCall(toolName, args),
                tool: toolName,
                status: "running",
              },
            } as ActivityDataPart);

            // Update pipeline step
            if (stepId) {
              writer.write({
                type: "data-pipeline",
                id: `step-${stepId}`,
                data: { stepId, status: "active" },
              } as PipelineDataPart);
            }
          },

          // onStepFinish captures provider-managed tools (e.g. web_search)
          // that don't fire experimental_onToolCallStart/Finish callbacks.
          onStepFinish({ toolCalls }) {
            for (const tc of toolCalls) {
              if (tc.toolName === "web_search") {
                // Mark benchmarks step active on first web_search
                if (!benchmarksStarted) {
                  benchmarksStarted = true;
                  writer.write({
                    type: "data-activity",
                    id: `tool-web_search-${Date.now()}`,
                    data: {
                      activityType: "tool_start",
                      title: "Searching the web",
                      tool: "web_search",
                      status: "running",
                    },
                  } as ActivityDataPart);

                  writer.write({
                    type: "data-pipeline",
                    id: "step-benchmarks",
                    data: { stepId: "benchmarks", status: "active" },
                  } as PipelineDataPart);
                }

                writer.write({
                  type: "data-activity",
                  id: `tool-web_search-done-${Date.now()}`,
                  data: {
                    activityType: "tool_complete",
                    title: "Completed: web search",
                    tool: "web_search",
                    status: "done",
                  },
                } as ActivityDataPart);

                writer.write({
                  type: "data-pipeline",
                  id: "step-benchmarks",
                  data: { stepId: "benchmarks", status: "completed" },
                } as PipelineDataPart);
              }
            }
          },

          experimental_onToolCallFinish(event) {
            const toolName = event.toolCall.toolName;
            const stepId = TOOL_STEP_MAP[toolName];

            // Emit tool complete activity
            writer.write({
              type: "data-activity",
              id: `tool-${toolName}-done-${Date.now()}`,
              data: {
                activityType: "tool_complete",
                title: `Completed: ${toolName}`,
                tool: toolName,
                status: "done",
              },
            } as ActivityDataPart);

            // Update pipeline step to completed
            if (stepId) {
              writer.write({
                type: "data-pipeline",
                id: `step-${stepId}`,
                data: { stepId, status: "completed" },
              } as PipelineDataPart);
            }

            // Capture calculation results (last-write-wins if called multiple times)
            if (toolName === "run_calculation" && event.success === true) {
              const output = event.output;
              if (
                output &&
                typeof output === "object" &&
                "scenarios" in output
              ) {
                scenarios = output as Record<string, unknown>;
              }
            }
          },
        });

        // Mark narrative step as active — the LLM is now generating text
        writer.write({
          type: "data-pipeline",
          id: "step-narrative",
          data: { stepId: "narrative", status: "active" },
        } as PipelineDataPart);

        // Merge the LLM stream into the UI stream.
        // pipeJsonRender separates JSONL patches (for json-render components)
        // from regular text in the stream, converting them to spec data parts.
        writer.merge(pipeJsonRender(result.toUIMessageStream()));

        // Wait for the stream to complete, then resolve with results
        const finalText = await result.text;

        // Emit narrative step completed
        writer.write({
          type: "data-pipeline",
          id: "step-narrative",
          data: { stepId: "narrative", status: "completed" },
        } as PipelineDataPart);

        // Emit pipeline completed
        writer.write({
          type: "data-activity",
          id: "pipeline-completed",
          data: {
            activityType: "milestone",
            title: "Analysis complete",
            status: "done",
          },
        } as ActivityDataPart);

        resolveResult!({
          scenarios,
          narrative: finalText,
          caseId,
        });
      } catch (error) {
        const errorMessage =
          error instanceof Error ? error.message : "Unknown pipeline error";

        writer.write({
          type: "data-activity",
          id: "pipeline-error",
          data: {
            activityType: "error",
            title: errorMessage,
            status: "error",
          },
        } as ActivityDataPart);

        rejectResult!(new Error(errorMessage));
      }
    },
  });

  return { stream, resultPromise };
}
