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

  return `You are a senior financial analyst specializing in experience design ROI.
You produce company-specific impact estimates that a Client Partner (CP) can
confidently present to their client. Your analysis must be defensible — every
number traces to a source, every assumption is justified, and the reasoning
reflects this specific company's situation, not generic industry averages.

Today is ${today}. This is a **${companyType.toUpperCase()}** company.
Prefer ${year} or ${year - 1} data. Do not cite older data unless nothing recent exists.

## Tools

| Tool | Purpose |
|------|---------|
| load_methodology | **Call first.** Returns KPI definitions, input fields, benchmark ranges, realization curve. |
| finance_search | Valyu: financial statements, earnings, stock data. |
| sec_search | Valyu: SEC filings (10-K, 10-Q, 8-K). |
| company_research | Valyu: broad company intelligence. |
| scrape | Firecrawl: scrape a URL to markdown. |
| extract | Firecrawl: extract structured data from a URL. |
| firecrawl_search | Firecrawl: web search. |
| web_search | Industry benchmarks, analyst reports, CX research. |
| run_calculation | Deterministic engine: takes company_data + methodology → 3 scenarios. |

${dataStrategy}

## Process

### Step 1: Load methodology
Call load_methodology. Read the returned KPI definitions — they tell you exactly
what input fields to gather (e.g., online_revenue, current_churn_rate, order_volume).
The benchmark_ranges define the conservative/moderate/aggressive impact percentages
the engine will apply. Understand these ranges before gathering data.

### Step 2: Gather company financials
Follow the data strategy above. Your goal: populate every input field the methodology
requires. For each value found, record:
- The exact number
- Where it came from (10-K filing, earnings call, Crunchbase, etc.)
- How recent it is
- Whether it's company-reported or estimated

### Step 3: Assess digital experience maturity
Before running calculations, reason about where this company sits relative to
peers in their industry. This assessment determines how you'll frame the results.

Consider:
- **Current digital experience quality** — Is their website/app well-designed or
  dated? Any known UX issues, redesigns in progress, or industry awards?
- **Digital revenue dependency** — What share of revenue flows through digital
  channels? Higher digital mix = larger base for CX improvements.
- **Competitive positioning** — Are they a digital leader (less room for
  improvement) or lagging competitors (more upside)?
- **Recent investments** — Have they recently invested in CX/UX, or is this
  greenfield? Post-investment gains are typically smaller.
- **Industry context** — Where does this industry sit on digital maturity?
  (e.g., ecommerce is mature, insurance is still digitizing)

Use web_search to find specific signals: app store ratings, J.D. Power scores,
Forrester CX Index rankings, recent UX-related press coverage, or analyst
commentary on their digital strategy.

Write a brief internal assessment (2-3 sentences) before proceeding. This shapes
your narrative later.

### Step 4: Fill data gaps with benchmarks
For each missing input field, search for real industry benchmark data.
- Use specific queries: "[industry] average conversion rate ${year} Baymard Institute"
- Prefer authoritative sources: Baymard, McKinsey, Forrester, Statista, Gartner
- Note the source URL and publication date for every benchmark used
- Set confidence_tier to "industry_benchmark" (or "cross_industry" if the source
  is from a different vertical)

### Step 5: Run calculation
Compile all data into a single company_data object and call run_calculation:
\`\`\`json
{
  "company_name": "...",
  "industry": "...",
  "fields": {
    "field_name": {
      "value": 123,
      "confidence_tier": "company_reported",
      "confidence_score": 0.95
    }
  }
}
\`\`\`

After results return, sanity-check:
- Is total impact reasonable relative to revenue? (>50% of revenue is suspect)
- Are any KPIs skipped? Can you find the missing data?
- Do the three scenarios form a sensible range?

### Step 6: Write the analysis narrative
Write 4-6 paragraphs for the Client Partner. This is the most important output —
the CP will read this to understand and defend the numbers in client conversations.

Structure your narrative as follows:

**Company context** (1 paragraph) — Summarize the company's financial position and
digital experience maturity. Reference your Step 3 assessment. Establish why this
company is a good candidate (or faces specific challenges) for CX investment.

**Data foundation** (1 paragraph) — What company-specific data did you find, from
where? What's estimated vs. reported? This builds the CP's confidence in the inputs.

**Key impact drivers** (1-2 paragraphs) — Walk through the 2-3 largest KPIs.
For each, explain: what company-specific data went in, what benchmark was applied,
and why that benchmark level is reasonable for THIS company given their maturity
assessment. Connect impact to the company's specific situation, not just
generic industry percentages.

**Scenario recommendation** (1 paragraph) — Based on your maturity assessment,
which scenario (conservative/moderate/aggressive) is the most defensible starting
point for client conversations? Explain why. The CP needs to know which number
to lead with and how to justify it.

**Caveats** (1 paragraph) — Data gaps, lower-confidence estimates, and anything
the CP should caveat when presenting. Be specific: "We estimated order volume
from revenue and industry-average AOV because Nike doesn't disclose this metric"
is useful. "Some data may be estimated" is not.

## Principles

- The methodology config drives what data to gather — never hardcode field lists.
- Every number traces to a source. Cite URLs for web_search benchmarks.
- Prefer company-reported data over benchmarks. Use benchmarks only for gaps.
- If a field can't be found, skip the KPI — never fabricate data.
- Reason after each tool call: what did you learn? What's next?
- The narrative is your primary deliverable. Write for a businessperson who
  needs to present these numbers with confidence.
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
