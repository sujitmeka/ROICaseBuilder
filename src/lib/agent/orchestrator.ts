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
import { discoverSkills, buildSkillsPrompt, createLoadSkillTool } from "./skills";

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
  load_skill: "classify",
  financial_data: "financials",
  company_research: "financials",
  scrape: "financials",
  extract: "financials",
  firecrawl_search: "financials",
  web_search: "benchmarks",
  validate_calculation: "calculate",
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
    case "validate_calculation":
      return "Validating ROI calculations";
    case "load_methodology":
      return `Loading methodology for ${(args.service_type as string) ?? "service"}`;
    case "load_skill":
      return `Loading ${(args.name as string) ?? "service"} skill`;
    case "web_search":
      return "Searching the web";
    default:
      return `Using ${toolName}`;
  }
}

// ---------------------------------------------------------------------------
// System Prompt
// ---------------------------------------------------------------------------

function getSystemPrompt(companyType: "public" | "private", skillsPrompt: string): string {
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
| load_skill | **Call after Step 1.** Loads service-specific reasoning guidance (scoping logic, sector lenses, maturity signals). |
| financial_data | Valyu: SEC filings, earnings, balance sheets, income statements, cash flow, statistics. Date-filtered (last 18 months). |
| company_research | Valyu: broad company intelligence (expensive — use sparingly). |
| scrape | Firecrawl: scrape a URL to markdown. |
| extract | Firecrawl: extract structured data from a URL. |
| firecrawl_search | Firecrawl: web search. |
| web_search | Industry benchmarks, analyst reports, CX research. |
| validate_calculation | Arithmetic validator: re-checks YOUR calculations, runs sanity checks, produces audit trail. |

${dataStrategy}

${skillsPrompt}

## Financial Modeling Framework

**Core principle:** Scope the addressable base first, then estimate improvement on
that scoped base. NEVER apply improvement percentages to total company revenue and
"correct" with attribution factors afterward.

**Wrong approach:** "Nike has $46B revenue, 10% conversion lift = $4.6B, multiply
by 12% attribution = $552M." This is backwards math — inflating then deflating.
The result is an artifact of the correction factor, not analysis.

**Right approach:** "This engagement targets Nike.com's checkout flow, which handles
~$5.2B/yr. A 10% conversion lift on that specific flow = $520M." The number is
grounded because the base was scoped to what the engagement actually touches.

## Process

### Step 1: Understand the engagement & load methodology
Call load_methodology first. Then reason about:

**What the methodology tells you:**
- **KPI definitions** — what metrics to evaluate and what company data inputs to gather
- **typical_range** — context for common impact percentages (NOT a formula — you determine actual values)
- **reasoning_guidance** — how to assess each KPI for this specific company
- **value_creation_framework** (if present) — enterprise-level indicators this service
  impacts and how they map to KPIs. This is your mental model for how the service creates value.
- **sector_lens** (if present) — industry-specific revenue levers, margin drivers, and
  operational context. Find the matching lens and let it sharpen which KPIs matter most.
- **service_tiers** (if present) — maps engagement cost to service tiers with scope expectations.

**What you must reason about:**
- What specific business processes, customer journeys, or operational flows will this
  engagement actually change? A diagnostic (CORE) touches 1 journey. An enterprise
  redesign touches the full lifecycle.
- What tier does this engagement's cost map to? This determines how much of the
  business you can realistically claim to affect.
- What does this company's industry tell you about where value is created?

Write 2-3 sentences about what this engagement will specifically change before proceeding.

**Then load the service skill:** If a service-specific skill is available (listed in
the Available Service Skills section), call load_skill with the matching name. This
gives you detailed reasoning guidance for scoping, maturity assessment, and narrative
framing specific to this service type.

### Step 2: Source company data
Follow the data strategy above. Your goal: populate every input field the methodology
requires. For each value found, record:
- The exact number
- Where it came from (10-K filing, earnings call, Crunchbase, etc.)
- How recent it is
- Whether it's company-reported or estimated

**Critical for Step 3:** Also look for SEGMENT and CHANNEL revenue breakdowns.
You need to know how much revenue flows through specific business functions:
- Digital vs. physical revenue split
- Revenue by channel (web, mobile app, in-store, wholesale)
- Revenue by segment or geography (if relevant to scoping)
These numbers are often in 10-K segment disclosures or earnings call commentary.

### Step 3: Scope the addressable base (CRITICAL — this determines everything)
**This is the most important step. Do NOT skip it.**

Ask: "What specific slice of the business does this engagement actually touch?"

The addressable base is NOT total company revenue. It is the revenue (or cost base)
flowing through the specific journeys, channels, or processes being redesigned.

**How to scope by service type:**
| Service Type | Addressable Base = |
|---|---|
| Experience Transformation | Revenue through the specific journey(s) being redesigned (e.g., checkout flow, onboarding funnel, mobile app purchase path) |
| Org Redesign | Headcount cost + productivity output of the functions being restructured |
| New Product Development | TAM slice for the specific market segment being targeted |
| Digital Transformation | Revenue/cost flowing through the systems being replaced |

**How to scope by engagement tier:**
| Tier | Typical Scope |
|---|---|
| CORE ($150-200K) | 1 priority journey. Addressable base = revenue through that ONE journey. |
| EXPANDED ($275-350K) | 2-3 priority journeys. Addressable base = combined revenue through those journeys. |
| ENTERPRISE ($400-500K+) | Full customer lifecycle or multiple business units. Broader base, but still not total revenue unless engagement truly spans everything. |

**Example — Nike Experience Transformation (CORE tier, $200K):**
- Nike total revenue: $46B
- Nike.com direct revenue: ~$13B
- CORE engagement focuses on mobile checkout experience
- Mobile checkout handles ~40% of digital orders: ~$5.2B
- **Addressable base: $5.2B** (not $46B, not $13B)

Document your scoping logic explicitly — this is the single most important assumption
in the entire model.

### Step 4: Assess maturity & estimate improvement
**Maturity assessment:** Reason about where this company sits relative to peers.

Consider:
- **Current digital experience quality** — well-designed or dated? Known UX issues?
- **Digital revenue dependency** — what share flows through digital channels?
- **Competitive positioning** — digital leader (less room) or lagging (more upside)?
- **Recent investments** — recent CX/UX spend means smaller incremental gains
- **Enterprise indicators** — if value_creation_framework exists, which indicators
  represent the biggest opportunity?
- **Sector context** — if sector_lens exists, use it to focus on the most relevant levers

Use web_search for signals: app store ratings, J.D. Power scores, Forrester CX Index,
recent press coverage, analyst commentary on digital strategy.

**Impact assumptions:** For each KPI, determine what improvement is realistic for THIS
company, applied to the SCOPED addressable base from Step 3.

**Scenario differentiation — scenarios must differ in SCOPE, not just percentages:**
- **CONSERVATIVE:** Top 2 highest-confidence drivers only. Exclude KPIs where >50% of
  inputs are estimated. Use lower end of typical_range. Set impact to 0 for excluded KPIs.
- **MODERATE:** All medium+ confidence drivers. Benchmarks acceptable for up to 2 inputs.
  Use midpoint of typical_range.
- **AGGRESSIVE:** ALL drivers including one "upside driver" that's plausible but less
  certain. Use upper end of typical_range.

Produce a structured impact_assumptions object:
\`\`\`json
{
  "conversion_rate_lift": { "conservative": 0.05, "moderate": 0.12, "aggressive": 0.20 },
  "churn_reduction": { "conservative": 0, "moderate": 0.15, "aggressive": 0.25 },
  "nps_referral_revenue": { "conservative": 0, "moderate": 0, "aggressive": 3 }
}
\`\`\`
Setting conservative/moderate to 0 for low-confidence KPIs is correct and expected.
Explain your reasoning briefly for each KPI.

### Step 5: Fill data gaps with benchmarks
For each missing input field, search for real industry benchmark data.
- Use specific queries: "[industry] average conversion rate ${year} Baymard Institute"
- Prefer authoritative sources: Baymard, McKinsey, Forrester, Statista, Gartner
- Note the source URL and publication date for every benchmark used
- Set confidence_tier to "industry_benchmark" (or "cross_industry" if different vertical)

### Step 6: Document assumptions
**Before running the calculation, output a structured assumptions record.** This is
displayed to the Client Partner so they can see and defend every critical assumption.

Output this exact JSON structure in your response:
\`\`\`json
{"assumptions":{"addressable_base":{"value":5200000000,"label":"Mobile checkout revenue (scoped from $13B digital)","reasoning":"CORE engagement targets mobile checkout flow. Mobile handles ~40% of Nike.com orders based on industry mobile commerce benchmarks.","confidence":"estimated"},"scoping_logic":"Engagement tier is CORE ($200K, 8-10 weeks), which targets 1 priority journey. We scoped to mobile checkout as the highest-impact journey based on [specific reasoning].","key_assumptions":[{"assumption":"Mobile checkout handles 40% of digital orders","source":"Industry benchmark — Statista mobile commerce share 2025","impact_if_wrong":"Addressable base could range from $3.9B to $6.5B (30-50%)"},{"assumption":"Conversion rate improvement of 6% is achievable","source":"Baymard Institute checkout optimization benchmarks","impact_if_wrong":"Moderate scenario impact shifts by +/- $150M annually"}],"overlap_note":"Conversion rate lift and AOV increase both stem from checkout redesign — not fully additive. Engine applies overlap discount.","investment_sizing":"Total investment estimated at $2.5M: $200K consulting + $2.3M implementation (12 engineers × 50% × $180K loaded × 6 months = $648K engineering; $800K platform changes; $500K QA/testing; $350K change management/training)."}}
\`\`\`

Every field matters:
- **addressable_base**: The scoped revenue/cost base with reasoning for why this slice
- **scoping_logic**: Why this scope for this tier and engagement
- **key_assumptions**: 2-4 critical assumptions with source and what happens if wrong
- **overlap_note**: Which KPIs share underlying drivers
- **investment_sizing**: How total investment was estimated beyond consulting fee

### Step 7: Calculate and validate
**Do the math yourself first.** For each KPI in each scenario, calculate:
\`impact = input_1 * input_2 * ... * improvement_rate\`

Then call validate_calculation with YOUR calculations. The validator will:
- Re-check your arithmetic and flag any errors
- Produce year-over-year projections using the realization curve
- Run sanity checks (impact vs addressable base, ROI thresholds, concentration risk)
- Generate a structured audit trail for the frontend

\`\`\`json
{
  "company_name": "Nike",
  "industry": "retail",
  "addressable_base": { "value": 5200000000, "label": "Mobile checkout revenue" },
  "total_revenue": 46000000000,
  "realization_curve": [0.4, 0.7, 0.9],
  "scenarios": {
    "conservative": {
      "kpis": [
        {
          "id": "conversion_rate_lift",
          "label": "Conversion Rate Improvement",
          "category": "offensive",
          "inputs": { "addressable_revenue": 5200000000, "lift_pct": 0.05 },
          "formula": "addressable_revenue * lift_pct",
          "claimed_impact": 260000000
        }
      ],
      "overlap_adjustment_pct": 0.10,
      "investment": {
        "consulting_fee": 200000,
        "implementation_cost": 2300000,
        "total": 2500000
      }
    },
    "moderate": { ... },
    "aggressive": { ... }
  }
}
\`\`\`

**Key rules:**
- Use the SCOPED addressable base from Step 3 as your input values, not total revenue
- Set \`claimed_impact\` to 0 for KPIs excluded from a scenario (they appear as skipped)
- Set \`overlap_adjustment_pct\` when multiple offensive KPIs share the same underlying
  improvement (e.g., conversion lift and AOV from the same checkout redesign)
- Size the FULL investment realistically. The consulting fee is just the advisory cost.
  Reason about what implementation actually costs for THIS company at THIS scale:
  internal team allocation (headcount × % time × loaded cost × duration), technology/
  engineering costs, change management, training. For a Fortune 500, this is often
  millions — reason from the company's reality, not from a multiplier on the consulting fee.

**After validation returns:** Check the \`validation_warnings\` array. If any sanity
checks failed, go back to Step 3 and re-examine your addressable base. The most
common cause of absurd outputs is an insufficiently scoped base.

### Step 9: Formulate hypothesis & write narrative
**Hypothesis summary** — Output this JSON structure (displayed prominently in results):
\`\`\`json
{"hypothesis":{"topic":"One sentence describing the specific area of experience transformation analyzed for THIS company","summary":"2-3 sentences summarizing the core hypothesis. What experience gaps or opportunities did you identify? What is the primary mechanism through which improvement drives financial impact? Reference specific data points you found."}}
\`\`\`

**Analysis narrative** — Write 4-6 paragraphs for the Client Partner.

**Language rules (CRITICAL):**
- Use "has potential to unlock" instead of "could realize"
- Use "Return on Total Investment (ROTI)" instead of "ROI" — ROTI includes both
  consulting fees and estimated implementation costs
- Use "3-Year Cumulative Value (risk-adjusted)" instead of "3-Year Cumulative"
- Show investment breakdown: "(consulting fee + implementation cost)"
- If overlap adjustments applied, explain briefly
- Note which KPIs are included in conservative vs. aggressive and why

**Narrative structure:**

**Company context** (1 paragraph) — Financial position and digital maturity.
Reference your Step 4 maturity assessment. Why is this company a good candidate?

**Addressable scope** (1 paragraph) — Explain what specific journey/channel/process
you scoped to and WHY. Reference the engagement tier and what it covers. This is
new and critical — the CP needs to explain to the client exactly what slice of the
business the ROI case covers. Example: "This analysis focuses on the mobile checkout
experience, which handles approximately $5.2B in annual revenue — roughly 40% of
Nike's $13B digital business."

**Value creation framing** (1 paragraph) — If value_creation_framework exists, frame
WHY this service drives value. Reference enterprise-level indicators. If sector_lens
exists, use transformation_note. Mention execution_discipline indicators qualitatively.

**Key impact drivers** (1-2 paragraphs) — Walk through 2-3 largest KPIs. For each:
what data went in, what improvement you assumed, why it's reasonable for THIS company.
Note which drivers appear in conservative vs. only in aggressive.

**Scenario recommendation** (1 paragraph) — Which scenario is most defensible for
client conversations? Why? Which number should the CP lead with?
If service_tiers data exists, note tier alignment and value proposition.

**Assumptions & caveats** (1 paragraph) — Reference the assumptions documented in
Step 6. Be specific about data gaps. "We estimated mobile order volume from total
digital revenue and industry mobile commerce share" is useful. "Some data may be
estimated" is not. Mention overlap adjustments and realism caps where applied.

## Principles

- **Scope first, calculate second.** Never apply percentages to total revenue.
- The methodology config drives what data to gather — never hardcode field lists.
- Every number traces to a source. Cite URLs for web_search benchmarks.
- Prefer company-reported data over benchmarks. Use benchmarks only for gaps.
- If a field can't be found, skip the KPI — never fabricate data.
- Reason after each tool call: what did you learn? What's next?
- The narrative is your primary deliverable. Write for a businessperson who
  needs to present these numbers with confidence.
- Document every assumption explicitly. A defensible model has visible assumptions,
  not hidden ones.
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
    ? `The client has estimated total implementation cost at $${estimatedImplementationCost.toLocaleString()}.`
    : `No implementation cost was provided — you must estimate it yourself based on the company's scale, organizational complexity, and what implementation actually requires for a company of this size.`;

  const userTask =
    `Analyze the ROI case for ${companyName} in the ${industry} industry ` +
    `using the ${serviceType} methodology.\n\n` +
    `The estimated project cost (engagement/consulting fee) is ${formattedCost}.\n` +
    `${implCostNote}\n\n` +
    `Follow the 9-step process in your instructions. Key steps:\n` +
    `1. Load methodology (service_type: "${serviceType}")\n` +
    `2. Load the service-specific skill if available\n` +
    `3. Gather financial data and scope the addressable base\n` +
    `4. Do your own calculations, then call validate_calculation to verify\n` +
    `5. Write the narrative\n\n` +
    `The exact service_type slug for load_methodology is "${serviceType}".`;

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

        // Discover available service skills
        const skills = await discoverSkills();
        const skillsPrompt = buildSkillsPrompt(skills);

        const result = streamText({
          model: anthropic("claude-opus-4-6"),
          system: getSystemPrompt(companyType, skillsPrompt),
          messages: [{ role: "user", content: userTask }],
          providerOptions: {
            anthropic: {
              thinking: { type: "adaptive" },
              effort: "max",
            } satisfies AnthropicLanguageModelOptions,
          },
          tools: {
            ...tools,
            // Service-specific skill loading
            ...(skills.length > 0 && { load_skill: createLoadSkillTool(skills) }),
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
            if (toolName === "validate_calculation" && event.success === true) {
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

        // Extract hypothesis from LLM output
        const hypothesisMatch = finalText.match(/\{"hypothesis"\s*:\s*\{[^}]*"topic"\s*:\s*"((?:[^"\\]|\\.)*)"\s*,\s*"summary"\s*:\s*"((?:[^"\\]|\\.)*)"\s*\}\s*\}/);
        if (hypothesisMatch) {
          writer.write({
            type: "data-hypothesis",
            id: "hypothesis",
            data: {
              topic: hypothesisMatch[1].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
              summary: hypothesisMatch[2].replace(/\\"/g, '"').replace(/\\n/g, '\n'),
            },
          });
        }

        // Extract assumptions from LLM output
        const assumptionsMatch = finalText.match(/\{"assumptions"\s*:\s*\{[\s\S]*?"investment_sizing"\s*:\s*"(?:[^"\\]|\\.)*"\s*\}\s*\}/);
        if (assumptionsMatch) {
          try {
            const parsed = JSON.parse(assumptionsMatch[0]);
            if (parsed.assumptions) {
              writer.write({
                type: "data-assumptions",
                id: "assumptions",
                data: parsed.assumptions,
              });
            }
          } catch {
            // If JSON parsing fails, skip — assumptions are best-effort
          }
        }

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
