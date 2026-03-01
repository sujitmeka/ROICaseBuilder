/**
 * CPROIOrchestrator — Agentic ROI pipeline using Vercel AI SDK streamText().
 *
 * Uses streamText() + stopWhen(stepCountIs(20)) to run the multi-step pipeline.
 * Emits custom data parts (data-activity, data-pipeline) via createUIMessageStream
 * so the frontend can show real-time progress. Results are rendered from the
 * structured CalculationResult data, not from the LLM's text output.
 */

import { streamText, stepCountIs, createUIMessageStream } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { financeSearch, secSearch, companyResearch } from "@valyu/ai-sdk";
import { scrapeTool, extractTool, searchTool } from "firecrawl-aisdk";
import { tools } from "./tools";

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
  finance_search: "financials",
  sec_search: "financials",
  company_research: "financials",
  scrape: "financials",
  extract: "financials",
  firecrawl_search: "financials",
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
    case "finance_search":
      return `Searching financial data: ${(args.query as string)?.slice(0, 60) ?? "financials"}`;
    case "sec_search":
      return `Searching SEC filings: ${(args.query as string)?.slice(0, 60) ?? "filings"}`;
    case "company_research":
      return `Researching company: ${(args.query as string)?.slice(0, 60) ?? "company"}`;
    case "scrape":
      return `Scraping ${(args.url as string)?.slice(0, 50) ?? "webpage"}`;
    case "extract":
      return `Extracting data from ${(args.url as string)?.slice(0, 50) ?? "webpage"}`;
    case "firecrawl_search":
      return `Searching web: ${(args.query as string)?.slice(0, 60) ?? "query"}`;
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

function getSystemPrompt(companyType: "public" | "private"): string {
  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear();

  const dataStrategy = companyType === "public"
    ? `## Data Strategy: PUBLIC Company

Use Valyu's structured financial datasets as your primary data source:
- **finance_search** — Query for specific metrics: revenue, net income, margins, growth rates.
  Use specific queries like "Nike annual revenue ${year}" or "Nike gross margin".
- **sec_search** — Query SEC filings (10-K, 10-Q, 8-K) for detailed financial data.
  Use queries like "Nike 10-K annual report revenue".
- **company_research** — Get a broad company overview with funding, valuation, market data.

These tools return structured data from real financial sources. Be specific in your queries.`
    : `## Data Strategy: PRIVATE Company

This is a private company — SEC filings and public financial data are not available.
Use Firecrawl and Valyu to gather what data exists:
- **company_research** — Try this first for any available company intelligence.
- **scrape** — Scrape specific pages (Crunchbase, PitchBook, company website) for data.
  Use URLs like "https://www.crunchbase.com/organization/{company-slug}".
- **extract** — Extract structured data from webpages with a natural language prompt.
- **firecrawl_search** — Search the web for company information via Firecrawl.

Data from private companies has lower confidence. Set confidence_tier to "estimated"
and confidence_score to 0.5 or lower for scraped/estimated values.`;

  return `You are the CPROI Orchestrator Agent. Your role is to coordinate the end-to-end
ROI calculation pipeline for client partner engagements.

## Important Context

Today's date is ${today}. Always search for the most recent data available (prefer ${year}
or ${year - 1} data). Do not search for or cite outdated data from earlier years unless
no recent data exists.

This is a **${companyType.toUpperCase()}** company.

## Your Tools

- **load_methodology** — Call this FIRST. Returns the methodology config with KPI definitions,
  required input fields, benchmark ranges, and realization curve. This drives everything.
- **finance_search** — Search Valyu's structured financial datasets for stock prices, earnings,
  financial statements, income statements, balance sheets, and cash flow data.
- **sec_search** — Search SEC filings (10-K, 10-Q, 8-K), insider transactions, and regulatory
  disclosures via Valyu.
- **company_research** — Comprehensive company intelligence via Valyu.
- **scrape** — Scrape a single URL and return its content as markdown (Firecrawl).
- **extract** — Extract structured data from a URL using a natural language prompt (Firecrawl).
- **firecrawl_search** — Search the web for information via Firecrawl.
- **web_search** — Search the web for industry benchmark data to fill gaps.
  Use specific queries like "retail average conversion rate ${year} Baymard Institute".
- **run_calculation** — Runs the ROI calculation engine against gathered data.
  Pass company_data as a nested object with company_name, industry, and fields.
  Each field should be an object with value, confidence_tier, and confidence_score.
  Returns 3 scenarios with full audit trail.

${dataStrategy}

## Process

1. **Load methodology** — Call load_methodology to get the config for this service type.
   Read the KPI definitions to understand what input fields you need.

2. **Gather financial data** — Follow the data strategy above based on company type.
   Your goal is to populate the fields required by the methodology's KPIs.

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

5. **Write calculation narrative** — After the calculation completes, write a brief
   explanation (3-5 paragraphs) of your analysis for the Client Partner. Cover:
   - What financial data you found and from where (cite specific sources)
   - What benchmark assumptions you used and why they're reasonable
   - How the key impact numbers were derived (walk through 1-2 of the biggest KPIs)
   - Any caveats, data gaps, or confidence concerns the CP should know about
   Write in clear business language. The CP will use this to understand and defend
   the numbers in conversation with the client. Do not repeat raw numbers the UI
   already shows — focus on reasoning, sources, and judgment calls.

## Key Principles

- The methodology config drives what data to gather — never hardcode field lists.
- Every number must trace to a source. When using web_search benchmarks, cite the URL.
- Prefer company-reported data over benchmarks. Use benchmarks only for gaps.
- If a field can't be found anywhere, skip the KPI gracefully — don't fabricate data.
- Think step by step. After each tool call, reason about what you learned and what to do next.
- Your text output is shown to the CP as the calculation narrative. Write clearly and concisely.
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
  companyType: "public" | "private";
  estimatedProjectCost: number;
  serviceType: string;
  caseId: string;
}): {
  stream: ReadableStream;
  resultPromise: Promise<OrchestratorResult>;
} {
  const { companyName, industry, companyType, estimatedProjectCost, serviceType, caseId } = params;

  // Deferred promise — resolved when stream completes, rejected on error.
  // Using manual pattern for Node 20 compatibility (Promise.withResolvers requires Node 22+).
  let resolveResult: (value: OrchestratorResult) => void;
  let rejectResult: (reason: Error) => void;
  const resultPromise = new Promise<OrchestratorResult>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  const formattedCost = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 0,
  }).format(estimatedProjectCost);

  const userTask =
    `Analyze the ROI case for ${companyName} in the ${industry} industry ` +
    `using the ${serviceType} methodology.\n\n` +
    `The estimated project cost (engagement cost) is ${formattedCost}. ` +
    `When calling run_calculation, include this as an "engagement_cost" field ` +
    `in the company_data.fields object with value ${estimatedProjectCost}, ` +
    `confidence_tier "company_reported", and confidence_score 1.0.\n\n` +
    `Follow your process: load the methodology first, then gather financial ` +
    `data, fill gaps with web search benchmarks, and run the calculation.`;

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
          system: getSystemPrompt(companyType),
          messages: [{ role: "user", content: userTask }],
          tools: {
            ...tools,
            // Valyu tools — structured financial datasets (public companies only)
            ...(companyType === "public" && {
              finance_search: financeSearch({ maxNumResults: 5 }),
              sec_search: secSearch({ maxNumResults: 5 }),
            }),
            // Firecrawl tools — web scraping (private companies only)
            ...(companyType === "private" && {
              scrape: scrapeTool,
              extract: extractTool,
              firecrawl_search: searchTool,
            }),
            // Available for both — general company intel + web search + benchmarks
            company_research: companyResearch(),
            web_search: anthropic.tools.webSearch_20250305({ maxUses: 10 }),
          },
          stopWhen: stepCountIs(20),
          maxOutputTokens: 8192,

          experimental_onToolCallStart({ toolCall }) {
            if (!toolCall) return;
            const toolName = toolCall.toolName;
            const args = (toolCall.input ?? {}) as Record<string, unknown>;
            const stepId = TOOL_STEP_MAP[toolName];
            const toolCallId = `tool-${toolName}-${Date.now()}`;

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

            if (stepId) {
              writer.write({
                type: "data-pipeline",
                id: `step-${stepId}`,
                data: { stepId, status: "active" },
              } as PipelineDataPart);
            }
          },

          onStepFinish({ toolCalls }) {
            for (const tc of toolCalls) {
              if (!tc) continue;
              if (tc.toolName === "web_search") {
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
            if (!event.toolCall) return;
            const toolName = event.toolCall.toolName;
            const stepId = TOOL_STEP_MAP[toolName];

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

            if (stepId) {
              writer.write({
                type: "data-pipeline",
                id: `step-${stepId}`,
                data: { stepId, status: "completed" },
              } as PipelineDataPart);
            }

            // Capture calculation results and emit to frontend
            if (toolName === "run_calculation" && event.success === true) {
              const output = event.output;
              if (
                output &&
                typeof output === "object" &&
                "scenarios" in output
              ) {
                scenarios = output as Record<string, unknown>;

                // Emit result as a custom data part so the frontend can
                // render structured results immediately (no message parsing needed)
                writer.write({
                  type: "data-result",
                  id: "calculation-result",
                  data: output,
                });
              }
            }
          },
        });

        // Mark finalizing step as active
        writer.write({
          type: "data-pipeline",
          id: "step-narrative",
          data: { stepId: "narrative", status: "active" },
        } as PipelineDataPart);

        // Merge the LLM stream into the UI stream (carries tool results to the client).
        // sendSources: true includes web search citations as source-url parts.
        writer.merge(result.toUIMessageStream({ sendSources: true }));

        // Wait for the stream to complete
        const finalText = await result.text;

        // Emit finalizing step completed
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
