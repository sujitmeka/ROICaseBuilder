/**
 * CPROIOrchestrator — Agentic ROI pipeline using Vercel AI SDK streamText().
 *
 * Uses streamText() + stopWhen(stepCountIs(20)) to run the multi-step pipeline.
 * Emits custom data parts (data-activity, data-pipeline) via createUIMessageStream
 * so the frontend can show real-time progress. Results are rendered from the
 * structured CalculationResult data, not from the LLM's text output.
 */

import { streamText, stepCountIs, createUIMessageStream } from "ai";
import { anthropic, type AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { companyResearch } from "@valyu/ai-sdk";
import { financialData } from "./valyu-tools";
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
  financial_data: "financials",
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

function summarizeFinancialQuery(query: string): string {
  const q = query.toLowerCase();
  // Match leading capitalized words for company name
  const nameMatch = query.match(/^([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*){0,2})/);
  const company = nameMatch ? nameMatch[1] : query.split(" ").slice(0, 2).join(" ");

  if (q.includes("10-k")) return `Reading ${company}'s 10-K filing`;
  if (q.includes("10-q")) return `Reading ${company}'s 10-Q filing`;
  if (q.includes("8-k")) return `Reading ${company}'s 8-K filing`;
  if (q.includes("balance sheet")) return `Pulling ${company}'s balance sheet`;
  if (q.includes("cash flow")) return `Pulling ${company}'s cash flow`;
  if (q.includes("income")) return `Pulling ${company}'s income data`;
  if (q.includes("earnings")) return `Checking ${company}'s earnings`;
  if (q.includes("margin") || q.includes("ratio")) return `Analyzing ${company}'s margins`;
  if (q.includes("revenue") || q.includes("growth")) return `Searching ${company}'s revenue data`;
  return `Searching financials: ${query.slice(0, 55)}`;
}

function summarizeToolCall(
  toolName: string,
  args: Record<string, unknown>,
): string {
  switch (toolName) {
    case "financial_data":
      return summarizeFinancialQuery((args.query as string) ?? "financials");
    case "company_research":
      return `Researching ${(args.company as string) ?? "company"}`;
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

Use the financial_data tool as your PRIMARY data source. It searches 6 Valyu datasets:
SEC filings, earnings, balance sheets, income statements, cash flow, and statistics.
Date range defaults to the last 18 months → today (wide enough to capture annual 10-K filings). You can override dates if needed.

**Querying strategy — ALWAYS include the year to anchor results to the most recent data:**
1. Start with the most recent 10-K: "[Company] 10-K annual revenue and net income FY${year}" or FY${year - 1}
2. Also check for recent 10-Q: "[Company] 10-Q most recent quarter revenue ${year}"
   (10-Qs give you quarterly data that's more recent than the annual 10-K)
3. Query specific metrics with year: "[Company] balance sheet total assets ${year}"
4. For growth metrics: "[Company] revenue growth rate year over year ${year}"

**Important:** Many companies have fiscal years ending mid-year (e.g. Nike's FY ends May 31).
A 10-K for "FY2025 ended May 2025" is the LATEST annual filing — it's not old data.
Always check for more recent 10-Q filings to supplement the annual data.

**Be specific.** Each query costs money. Ask for exactly the metrics you need in one query
rather than making broad searches. Include the company name and metric in every query.

- **financial_data** — SEC filings, earnings, balance sheets, income statements, cash flow, statistics.
  Automatically filtered to last 18 months. Override start_date for older filings.
- **company_research** — Broad company intelligence overview (use sparingly, it's expensive).

Do NOT search for crypto, forex, economic indicators, or market movers — these are irrelevant.`
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
| load_methodology | **Call first.** Returns KPI definitions, typical ranges, reasoning guidance, realization curve. |
| financial_data | Valyu: SEC filings, earnings, balance sheets, income statements, cash flow, statistics. Date-filtered (last 18 months). |
| company_research | Valyu: broad company intelligence (expensive — use sparingly). |
| scrape | Firecrawl: scrape a URL to markdown. |
| extract | Firecrawl: extract structured data from a URL. |
| firecrawl_search | Firecrawl: web search. |
| web_search | Industry benchmarks, analyst reports, CX research. |
| run_calculation | Deterministic engine: takes company_data + impact_assumptions → 3 scenarios. |

${dataStrategy}

## Process

### Step 1: Load methodology (research guide)
Call load_methodology. The methodology is a research guide, not a formula:
- **KPI definitions** tell you what metrics to evaluate and what company data inputs to gather
- **typical_range** gives you context for what impact percentages are common across companies (NOT a fixed formula — you'll determine the actual values)
- **reasoning_guidance** explains how to assess each KPI for this specific company
- **reference_sources** suggest where to find supporting data

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

### Step 4: Determine impact assumptions (CRITICAL — scenarios must differ in SCOPE, not just percentages)
For each enabled KPI in the methodology, reason about what impact percentage
is realistic for THIS company across all three scenarios.

**Scenario differentiation is essential.** The three scenarios MUST differ in which
drivers are included, not just in percentage values:

- **CONSERVATIVE:** Include ONLY the top 2 highest-confidence drivers where you have
  strong company-specific data. Exclude KPIs where >50% of inputs are estimated/benchmarked.
  Use the lower end of typical_range. Set impact to 0 for excluded KPIs (they'll appear
  as skipped in the audit trail).
- **MODERATE:** Include all medium+ confidence drivers. Benchmarks are acceptable for
  up to 2 inputs per KPI. Use midpoint of typical_range.
- **AGGRESSIVE:** Include ALL drivers including one optional "upside driver" that's
  plausible but less certain. Use upper ranges of typical_range.

For each KPI:
1. Review the typical_range from the methodology (this is context, not a formula)
2. Consider your maturity assessment from Step 3
3. Consider the company's specific situation, competitive position, and digital readiness
4. Determine three impact values following the scope rules above

Your impact assumptions should reflect this specific company's situation. A digital
leader may have less room for improvement (lower percentages). A company with dated
digital experiences has more upside (higher percentages).

Produce a structured impact_assumptions object:
\`\`\`json
{
  "conversion_rate_lift": { "conservative": 0.05, "moderate": 0.12, "aggressive": 0.20 },
  "churn_reduction": { "conservative": 0, "moderate": 0.15, "aggressive": 0.25 },
  "nps_referral_revenue": { "conservative": 0, "moderate": 0, "aggressive": 3 }
}
\`\`\`
Note: setting conservative/moderate to 0 for low-confidence KPIs is correct and expected.
Explain your reasoning briefly for each KPI before moving to Step 5.

### Step 5: Fill data gaps with benchmarks
For each missing input field, search for real industry benchmark data.
- Use specific queries: "[industry] average conversion rate ${year} Baymard Institute"
- Prefer authoritative sources: Baymard, McKinsey, Forrester, Statista, Gartner
- Note the source URL and publication date for every benchmark used
- Set confidence_tier to "industry_benchmark" (or "cross_industry" if the source
  is from a different vertical)

### Step 6: Run calculation
Compile company data and your impact assumptions, then call run_calculation:
\`\`\`json
{
  "company_data": {
    "company_name": "...",
    "industry": "...",
    "fields": {
      "field_name": {
        "value": 123,
        "confidence_tier": "company_reported",
        "confidence_score": 0.95
      }
    }
  },
  "service_type": "experience-transformation-design",
  "impact_assumptions": {
    "conversion_rate_lift": { "conservative": 0.05, "moderate": 0.12, "aggressive": 0.20 }
  }
}
\`\`\`

After results return, sanity-check:
- Is total impact reasonable relative to revenue? (>50% of revenue is suspect)
- Are any KPIs skipped? Can you find the missing data?
- Do the three scenarios form a sensible range?

### Step 7: Write the analysis narrative
Write 4-6 paragraphs for the Client Partner. This is the most important output —
the CP will read this to understand and defend the numbers in client conversations.

**Language rules (CRITICAL):**
- Use "has potential to unlock" instead of "could realize"
- Use "Return on Total Investment (ROTI)" instead of "ROI" — explain that ROTI
  includes both consulting fees and estimated implementation costs
- Use "3-Year Cumulative Value (risk-adjusted)" instead of "3-Year Cumulative"
- When referencing the investment, show the breakdown: "(consulting fee + implementation cost)"
- If the engine flagged overlap adjustments, explain briefly: "Gross impact of $X was
  adjusted to $Y to account for overlap between related drivers"
- Note which KPIs are included in conservative vs. aggressive and why

Structure your narrative as follows:

**Company context** (1 paragraph) — Summarize the company's financial position and
digital experience maturity. Reference your Step 3 assessment. Establish why this
company is a good candidate (or faces specific challenges) for CX investment.

**Data foundation** (1 paragraph) — What company-specific data did you find, from
where? What's estimated vs. reported? This builds the CP's confidence in the inputs.

**Key impact drivers** (1-2 paragraphs) — Walk through the 2-3 largest KPIs.
For each, explain: what company-specific data went in, what impact assumption you used,
and why that impact level is reasonable for THIS company given their maturity
assessment. Note which drivers are in the conservative scenario and which only
appear in moderate/aggressive.

**Scenario recommendation** (1 paragraph) — Based on your maturity assessment,
which scenario (conservative/moderate/aggressive) is the most defensible starting
point for client conversations? Explain why. The CP needs to know which number to
lead with and how to justify it.

**Caveats** (1 paragraph) — Data gaps, lower-confidence estimates, and anything
the CP should caveat when presenting. Be specific: "We estimated order volume
from revenue and industry-average AOV because Nike doesn't disclose this metric"
is useful. "Some data may be estimated" is not. Mention that impact estimates
include overlap adjustments and realism caps where applied.

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
  estimatedImplementationCost?: number;
  serviceType: string;
  caseId: string;
}): {
  stream: ReadableStream;
  resultPromise: Promise<OrchestratorResult>;
} {
  const { companyName, industry, companyType, estimatedProjectCost, estimatedImplementationCost, serviceType, caseId } = params;

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

  const implCostNote = estimatedImplementationCost
    ? `The client has estimated total implementation cost at $${estimatedImplementationCost.toLocaleString()}. ` +
      `Pass estimated_implementation_cost: ${estimatedImplementationCost} when calling run_calculation.`
    : `No implementation cost was provided — the engine will auto-estimate it based on engagement cost and industry multipliers.`;

  const userTask =
    `Analyze the ROI case for ${companyName} in the ${industry} industry ` +
    `using the ${serviceType} methodology.\n\n` +
    `The estimated project cost (engagement/consulting fee) is ${formattedCost}. ` +
    `When calling run_calculation, include this as an "engagement_cost" field ` +
    `in the company_data.fields object with value ${estimatedProjectCost}, ` +
    `confidence_tier "company_reported", and confidence_score 1.0.\n\n` +
    `${implCostNote}\n\n` +
    `Follow your process: load the methodology first, then gather financial ` +
    `data, fill gaps with web search benchmarks, and run the calculation.\n\n` +
    `The exact service_type slug for tool calls is "${serviceType}". ` +
    `Use this exact string when calling load_methodology and run_calculation.`;

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
          model: anthropic("claude-opus-4-6"),
          system: getSystemPrompt(companyType),
          messages: [{ role: "user", content: userTask }],
          providerOptions: {
            anthropic: {
              thinking: { type: "adaptive" },
              effort: "max",
            } satisfies AnthropicLanguageModelOptions,
          },
          tools: {
            ...tools,
            // Valyu financial data — restricted to 6 datasets with date guardrails (public companies only)
            ...(companyType === "public" && {
              financial_data: financialData({ maxNumResults: 5 }),
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
          maxOutputTokens: 16000,

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
