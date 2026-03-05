/**
 * End-to-end test: run the full LLM pipeline for Nike.
 * Calls Opus 4.6 with real system prompt, tools, and skills.
 *
 * Usage: npx tsx scripts/load-env.ts
 */

// env is loaded by load-env.ts wrapper

import { streamText, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import type { AnthropicLanguageModelOptions } from "@ai-sdk/anthropic";
import { companyResearch } from "@valyu/ai-sdk";
import { financialData } from "../src/lib/agent/valyu-tools";
import { tools } from "../src/lib/agent/tools";
import { discoverSkills, buildSkillsPrompt, createLoadSkillTool } from "../src/lib/agent/skills";

export async function main() {
  console.log("Starting Nike E2E test...\n");
  console.log("Discovering skills...");
  const skills = await discoverSkills();
  console.log(`Found ${skills.length} service skill(s): ${skills.map(s => s.name).join(", ")}\n`);

  const today = new Date().toISOString().split("T")[0];
  const year = new Date().getFullYear();
  const skillsPrompt = buildSkillsPrompt(skills);

  const systemPrompt = buildSystemPrompt(today, year, skillsPrompt);

  const userMessage =
    `Analyze the ROI case for Nike in the ecommerce-retail industry ` +
    `using the experience-transformation-design methodology.\n\n` +
    `The estimated project cost (engagement/consulting fee) is $200,000.\n` +
    `No implementation cost was provided — you must estimate it yourself based on the company's scale, organizational complexity, and what implementation actually requires for a company of this size.\n\n` +
    `Follow the 9-step process in your instructions. Key steps:\n` +
    `1. Load methodology (service_type: "experience-transformation-design")\n` +
    `2. Load the service-specific skill if available\n` +
    `3. Gather financial data and scope the addressable base\n` +
    `4. Do your own calculations, then call validate_calculation to verify\n` +
    `5. Write the narrative\n\n` +
    `The exact service_type slug for load_methodology is "experience-transformation-design".`;

  console.log("Calling Opus 4.6...\n");
  console.log("=".repeat(80));

  const result = streamText({
    model: anthropic("claude-opus-4-6"),
    system: systemPrompt,
    messages: [{ role: "user", content: userMessage }],
    providerOptions: {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: "max",
      } satisfies AnthropicLanguageModelOptions,
    },
    tools: {
      ...tools,
      ...(skills.length > 0 && { load_skill: createLoadSkillTool(skills) }),
      financial_data: financialData({ maxNumResults: 5 }),
      company_research: companyResearch(),
      web_search: anthropic.tools.webSearch_20250305({ maxUses: 10 }),
    },
    stopWhen: stepCountIs(20),
    maxOutputTokens: 16000,

    onStepFinish({ toolCalls }) {
      for (const tc of toolCalls) {
        if (!tc) continue;
        const toolName = tc.toolName;
        const args = (tc.input ?? {}) as Record<string, unknown>;

        if (toolName === "load_methodology") {
          console.log(`\n[TOOL] load_methodology(${args.service_type})`);
        } else if (toolName === "load_skill") {
          console.log(`\n[TOOL] load_skill(${args.name})`);
        } else if (toolName === "validate_calculation") {
          console.log(`\n[TOOL] validate_calculation`);
          const ab = args.addressable_base as { value: number; label: string } | undefined;
          if (ab) console.log(`  Addressable base: $${fmt(ab.value)} — ${ab.label}`);
          const totalRev = args.total_revenue as number | undefined;
          if (totalRev) console.log(`  Total revenue: $${fmt(totalRev)}`);
          const scenarios = args.scenarios as Record<string, { kpis: Array<{ label: string; claimed_impact: number }>; investment: { total: number }; overlap_adjustment_pct?: number }> | undefined;
          if (scenarios) {
            for (const [name, s] of Object.entries(scenarios)) {
              const total = s.kpis.reduce((sum, k) => sum + k.claimed_impact, 0);
              console.log(`  ${name}: ${s.kpis.length} KPIs, $${fmt(total)} gross, $${fmt(s.investment.total)} investment, ${((s.overlap_adjustment_pct ?? 0) * 100).toFixed(0)}% overlap`);
            }
          }
        } else if (toolName === "financial_data") {
          console.log(`\n[TOOL] financial_data: "${(args.query as string)?.slice(0, 80)}"`);
        } else if (toolName === "web_search") {
          console.log(`\n[TOOL] web_search`);
        } else {
          console.log(`\n[TOOL] ${toolName}`);
        }
      }
    },
  });

  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log("\n" + "=".repeat(80));

  const usage = await result.usage;
  console.log(`\nTokens: ${usage.totalTokens} (${usage.promptTokens} prompt + ${usage.completionTokens} completion)`);

  // Extract validation results
  const steps = await result.steps;
  for (const step of steps) {
    for (const tc of step.toolCalls) {
      if (tc.toolName === "validate_calculation") {
        const tr = step.toolResults.find(r => r.toolCallId === tc.toolCallId);
        if (tr) {
          const vr = tr.result as Record<string, unknown>;
          const warnings = vr.validation_warnings as Array<{ type: string; message: string }> | undefined;
          if (warnings && warnings.length > 0) {
            console.log("\nValidation warnings:");
            for (const w of warnings) console.log(`  [${w.type}] ${w.message}`);
          }
          const scenarios = vr.scenarios as Record<string, { total_annual_impact: number; roi_multiple: number; cumulative_3yr_impact: number }> | undefined;
          if (scenarios) {
            console.log("\nFinal validated results:");
            for (const [name, s] of Object.entries(scenarios))
              console.log(`  ${name}: $${fmt(s.total_annual_impact)}/yr, ${s.roi_multiple?.toFixed(1)}x ROI, $${fmt(s.cumulative_3yr_impact)} 3yr`);
          }
        }
      }
    }
  }
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}

function buildSystemPrompt(today: string, year: number, skillsPrompt: string): string {
  return `You are a senior financial analyst specializing in experience design ROI.
You produce company-specific impact estimates that a Client Partner (CP) can
confidently present to their client. Your analysis must be defensible — every
number traces to a source, every assumption is justified, and the reasoning
reflects this specific company's situation, not generic industry averages.

Today is ${today}. This is a **PUBLIC** company.
Prefer ${year} or ${year - 1} data. Do not cite older data unless nothing recent exists.

## Tools

| Tool | Purpose |
|------|---------|
| load_methodology | **Call first.** Returns KPI definitions, typical ranges, reasoning guidance, realization curve. |
| load_skill | **Call after Step 1.** Loads service-specific reasoning guidance (scoping logic, sector lenses, maturity signals). |
| financial_data | Valyu: SEC filings, earnings, balance sheets, income statements, cash flow, statistics. Date-filtered (last 18 months). |
| company_research | Valyu: broad company intelligence (expensive — use sparingly). |
| web_search | Industry benchmarks, analyst reports, CX research. |
| validate_calculation | Arithmetic validator: re-checks YOUR calculations, runs sanity checks, produces audit trail. |

## Data Strategy: PUBLIC Company

Use the financial_data tool as your PRIMARY data source.

**Querying strategy — ALWAYS include the year to anchor results:**
1. Start with the most recent 10-K: "[Company] 10-K annual revenue and net income FY${year}" or FY${year - 1}
2. Query specific metrics with year: "[Company] digital revenue ecommerce ${year}"

**Be specific.** Each query costs money. Ask for exactly the metrics you need.

${skillsPrompt}

## Financial Modeling Framework

**Core principle:** Scope the addressable base first, then estimate improvement on
that scoped base. NEVER apply improvement percentages to total company revenue and
"correct" with attribution factors afterward.

## Process

### Step 1: Understand the engagement & load methodology
Call load_methodology first. Then reason about what this service type actually changes.
Then call load_skill if a matching service skill is available.

### Step 2: Source company data
Gather financial data. Also look for SEGMENT and CHANNEL revenue breakdowns — you need
to know how much revenue flows through specific channels (digital vs physical, web vs mobile).

### Step 3: Scope the addressable base (CRITICAL)
Ask: "What specific slice of the business does this engagement actually touch?"
The addressable base is NOT total company revenue. It is the revenue flowing through
the specific journeys/channels being redesigned.

### Step 4: Assess maturity & estimate improvement
Maturity assessment + impact assumptions per KPI.
Scenarios must differ in SCOPE, not just percentages:
- CONSERVATIVE: Top 2 highest-confidence drivers only
- MODERATE: All medium+ confidence drivers
- AGGRESSIVE: ALL drivers including upside

### Step 5: Fill data gaps with benchmarks
Use web_search for industry benchmarks from authoritative sources.

### Step 6: Document assumptions
Output structured assumptions JSON:
\`\`\`json
{"assumptions":{"addressable_base":{"value":0,"label":"...","reasoning":"...","confidence":"estimated"},"scoping_logic":"...","key_assumptions":[{"assumption":"...","source":"...","impact_if_wrong":"..."}],"overlap_note":"...","investment_sizing":"..."}}
\`\`\`

### Step 7: Calculate and validate
Do the math yourself for each KPI. Then call validate_calculation with YOUR calculations.

**Size the FULL investment.** The consulting fee ($200K) is just the advisory cost.
For a large enterprise implementing experience changes, estimate:
- Internal team allocation (people x % time x loaded cost x duration)
- Technology/engineering implementation costs
- Change management and training
The total is typically MUCH larger than the consulting fee for enterprise companies.

### Step 8: Formulate hypothesis
Output: {"hypothesis":{"topic":"...","summary":"..."}}

### Step 9: Write the analysis narrative
Write 4-6 paragraphs for the Client Partner. Include:
- Company context and maturity
- Addressable scope explanation
- Key impact drivers
- Scenario recommendation
- Assumptions and caveats

## Principles
- **Scope first, calculate second.** Never apply percentages to total revenue.
- Every number traces to a source.
- Document every assumption explicitly.
`;
}
