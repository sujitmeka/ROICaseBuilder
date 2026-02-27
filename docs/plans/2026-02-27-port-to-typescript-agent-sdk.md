# Port Backend to TypeScript Agent SDK + Supabase

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Eliminate the Python backend entirely. The Next.js app runs the agent pipeline via the TypeScript Agent SDK (`@anthropic-ai/claude-agent-sdk`), reads/writes all data from Supabase, and deploys to Vercel with zero local servers.

**Architecture:** Next.js API route (`/api/cases/route.ts`) handles case creation and triggers the agent pipeline inline using the TS Agent SDK. Custom tools (fetch_financials, run_calculation, etc.) are defined as TypeScript MCP tools. The calculation engine, KPI formulas, and methodology types are ported from Python to TypeScript. Supabase stores cases, methodologies, and audit trails. SSE streaming from the API route pushes progress events to the frontend.

**Tech Stack:** Next.js 15 (App Router), TypeScript, `@anthropic-ai/claude-agent-sdk`, `zod`, `@supabase/supabase-js`, Vercel

**Supabase project:** `mzxwnekvuluzixshqxro` (tables already created: `methodologies`, `cases`, `audit_trail`)

---

## Task 1: Install TypeScript Agent SDK and set up project structure

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/lib/agent/types.ts`
- Create: `frontend/src/lib/agent/kpi-formulas.ts`
- Create: `frontend/src/lib/agent/calculation-engine.ts`
- Create: `frontend/src/lib/agent/orchestrator.ts`
- Create: `frontend/src/lib/agent/tools.ts`

**Step 1: Install dependencies**

```bash
cd frontend
npm install @anthropic-ai/claude-agent-sdk zod
```

**Step 2: Add ANTHROPIC_API_KEY to env**

Add to `frontend/.env.local`:
```
ANTHROPIC_API_KEY=your-api-key
```

**Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/.env.local
git commit -m "chore: install TypeScript Agent SDK and zod"
```

---

## Task 2: Port types and enums from Python to TypeScript

**Files:**
- Create: `frontend/src/lib/agent/types.ts`

**Step 1: Write types file**

Port all Python enums and dataclasses to TypeScript types. The key types are:

```typescript
// === Enums ===
export type Scenario = "conservative" | "moderate" | "aggressive";
export type DataSourceTier = "company_reported" | "industry_benchmark" | "cross_industry" | "estimated";

// === Methodology types (match Supabase schema) ===
export interface BenchmarkRanges {
  conservative: number;
  moderate: number;
  aggressive: number;
}

export interface KPIConfig {
  id: string;
  label: string;
  weight: number;
  formula: string;
  inputs: string[];
  benchmark_ranges: BenchmarkRanges;
  benchmark_source: string;
  enabled: boolean;
}

export interface ConfidenceDiscounts {
  company_reported: number;   // 1.0
  industry_benchmark: number; // 0.8
  cross_industry: number;     // 0.6
  estimated: number;          // 0.4
}

export interface MethodologyConfig {
  id: string;
  name: string;
  version: string;
  applicable_industries: string[];
  service_type: string;
  kpis: KPIConfig[];
  realization_curve: number[];
  confidence_discounts: ConfidenceDiscounts;
}

// === Company Data ===
export interface DataPointInput {
  value: number;
  confidence_tier: DataSourceTier;
  confidence_score: number;
}

export interface CompanyData {
  company_name: string;
  industry: string;
  fields: Record<string, DataPointInput>;
}

// === Calculation Results ===
export interface KPIAuditEntry {
  kpi_id: string;
  kpi_label: string;
  formula_description: string;
  inputs_used: Record<string, number>;
  benchmark_value: number;
  benchmark_source: string;
  raw_impact: number;
  confidence_discount: number;
  adjusted_impact: number;
  weight: number;
  weighted_impact: number;
  category: string;
  skipped: boolean;
  skip_reason?: string;
}

export interface YearProjection {
  year: number;
  realization_percentage: number;
  projected_impact: number;
  cumulative_impact: number;
}

export interface ScenarioResult {
  scenario: Scenario;
  kpi_results: KPIAuditEntry[];
  total_annual_impact: number;
  total_annual_impact_unweighted: number;
  impact_by_category: Record<string, number>;
  year_projections: YearProjection[];
  cumulative_3yr_impact: number;
  roi_percentage?: number;
  roi_multiple?: number;
  engagement_cost?: number;
  skipped_kpis: string[];
}

export interface CalculationResult {
  company_name: string;
  industry: string;
  methodology_id: string;
  methodology_version: string;
  scenarios: Record<Scenario, ScenarioResult>;
  data_completeness: number;
  missing_inputs: string[];
  available_inputs: string[];
  warnings: string[];
}
```

**Step 2: Commit**

```bash
git add frontend/src/lib/agent/types.ts
git commit -m "feat: port Python types and enums to TypeScript"
```

---

## Task 3: Port KPI formulas and calculation engine

**Files:**
- Create: `frontend/src/lib/agent/kpi-formulas.ts`
- Create: `frontend/src/lib/agent/calculation-engine.ts`

**Step 1: Write KPI formulas**

Port the 5 formula functions from `backend/kpi_library/formulas.py`. Each KPI has:
- `id` matching the methodology config
- `requiredInputs` — CompanyData field names
- `benchmarkInput` — name of the benchmark kwarg
- `formula` — the actual math function
- `category` — for grouping in results

```typescript
// frontend/src/lib/agent/kpi-formulas.ts
export interface KPIDefinition {
  id: string;
  label: string;
  requiredInputs: string[];
  benchmarkInput: string;
  formula: (inputs: Record<string, number>) => number;
  category: string;
}

export const KPI_REGISTRY: Record<string, KPIDefinition> = {
  conversion_rate_lift: {
    id: "conversion_rate_lift",
    label: "Conversion Rate Improvement",
    requiredInputs: ["online_revenue"],
    benchmarkInput: "lift_percentage",
    formula: ({ online_revenue, lift_percentage }) => online_revenue * lift_percentage,
    category: "revenue",
  },
  aov_increase: {
    id: "aov_increase",
    label: "Average Order Value Increase",
    requiredInputs: ["order_volume", "current_aov"],
    benchmarkInput: "lift_percentage",
    formula: ({ order_volume, current_aov, lift_percentage }) => {
      const newAov = current_aov * (1 + lift_percentage);
      return order_volume * (newAov - current_aov);
    },
    category: "revenue",
  },
  churn_reduction: {
    id: "churn_reduction",
    label: "Revenue Saved from Churn Reduction",
    requiredInputs: ["current_churn_rate", "customer_count", "revenue_per_customer"],
    benchmarkInput: "reduction_percentage",
    formula: ({ current_churn_rate, customer_count, revenue_per_customer, reduction_percentage }) => {
      const customersAtRisk = current_churn_rate * customer_count;
      const customersSaved = customersAtRisk * reduction_percentage;
      return customersSaved * revenue_per_customer;
    },
    category: "retention",
  },
  support_cost_savings: {
    id: "support_cost_savings",
    label: "Support Cost Savings",
    requiredInputs: ["current_support_contacts", "cost_per_contact"],
    benchmarkInput: "reduction_percentage",
    formula: ({ current_support_contacts, cost_per_contact, reduction_percentage }) =>
      current_support_contacts * reduction_percentage * cost_per_contact,
    category: "cost_savings",
  },
  nps_referral_revenue: {
    id: "nps_referral_revenue",
    label: "NPS-Linked Referral Revenue",
    requiredInputs: ["annual_revenue"],
    benchmarkInput: "nps_point_improvement",
    formula: ({ annual_revenue, nps_point_improvement }) =>
      annual_revenue * (nps_point_improvement / 7.0) * 0.01,
    category: "revenue",
  },
};
```

**Step 2: Write calculation engine**

Port `backend/engine/calculator.py`. Key behaviors:
- Runs 3 scenarios (conservative, moderate, aggressive)
- For each KPI: gathers inputs from CompanyData, injects benchmark value, runs formula
- Confidence discount = MIN of all input tiers
- Multi-year projection uses realization curve
- ROI calculated if engagement_cost available

```typescript
// frontend/src/lib/agent/calculation-engine.ts
import type {
  CalculationResult, CompanyData, ConfidenceDiscounts, DataSourceTier,
  KPIAuditEntry, KPIConfig, MethodologyConfig, Scenario,
  ScenarioResult, YearProjection,
} from "./types";
import { KPI_REGISTRY } from "./kpi-formulas";

const SCENARIOS: Scenario[] = ["conservative", "moderate", "aggressive"];

function getDiscount(discounts: ConfidenceDiscounts, tier: DataSourceTier): number {
  return discounts[tier];
}

export function calculate(companyData: CompanyData, methodology: MethodologyConfig): CalculationResult {
  const enabledKpis = methodology.kpis.filter((k) => k.enabled);
  const requiredInputs = new Set(enabledKpis.flatMap((k) => k.inputs));
  const availableInputs = new Set(Object.keys(companyData.fields));
  const missing = [...requiredInputs].filter((i) => !availableInputs.has(i));
  const completeness = requiredInputs.size > 0
    ? (requiredInputs.size - missing.length) / requiredInputs.size
    : 1.0;

  const warnings: string[] = [];
  if (missing.length > 0) {
    warnings.push(`Missing inputs: ${missing.sort().join(", ")}. KPIs requiring these will be skipped.`);
  }

  const scenarios = {} as Record<Scenario, ScenarioResult>;
  for (const scenario of SCENARIOS) {
    scenarios[scenario] = runScenario(companyData, methodology, enabledKpis, scenario);
  }

  return {
    company_name: companyData.company_name,
    industry: companyData.industry,
    methodology_id: methodology.id,
    methodology_version: methodology.version,
    scenarios,
    data_completeness: completeness,
    missing_inputs: missing.sort(),
    available_inputs: [...availableInputs].filter((i) => requiredInputs.has(i)).sort(),
    warnings,
  };
}

function runScenario(
  companyData: CompanyData, config: MethodologyConfig,
  enabledKpis: KPIConfig[], scenario: Scenario,
): ScenarioResult {
  const kpiResults: KPIAuditEntry[] = [];
  const skippedKpis: string[] = [];

  for (const kpiConfig of enabledKpis) {
    const entry = calculateSingleKpi(companyData, kpiConfig, config, scenario);
    kpiResults.push(entry);
    if (entry.skipped) skippedKpis.push(entry.kpi_id);
  }

  const totalUnweighted = kpiResults.filter((e) => !e.skipped).reduce((s, e) => s + e.adjusted_impact, 0);
  const totalWeighted = kpiResults.filter((e) => !e.skipped).reduce((s, e) => s + e.weighted_impact, 0);

  const impactByCategory: Record<string, number> = {};
  for (const entry of kpiResults) {
    if (!entry.skipped) {
      impactByCategory[entry.category] = (impactByCategory[entry.category] ?? 0) + entry.adjusted_impact;
    }
  }

  const yearProjections = projectMultiYear(totalUnweighted, config.realization_curve);
  const cumulative = yearProjections.reduce((s, p) => s + p.projected_impact, 0);

  const engCost = companyData.fields.engagement_cost;
  let roiPct: number | undefined;
  let roiMult: number | undefined;
  let engCostVal: number | undefined;

  if (engCost && engCost.value > 0) {
    engCostVal = engCost.value;
    roiPct = ((totalUnweighted - engCostVal) / engCostVal) * 100;
    roiMult = totalUnweighted / engCostVal;
  }

  return {
    scenario,
    kpi_results: kpiResults,
    total_annual_impact: totalWeighted,
    total_annual_impact_unweighted: totalUnweighted,
    impact_by_category: impactByCategory,
    year_projections: yearProjections,
    cumulative_3yr_impact: cumulative,
    roi_percentage: roiPct,
    roi_multiple: roiMult,
    engagement_cost: engCostVal,
    skipped_kpis: skippedKpis,
  };
}

function calculateSingleKpi(
  companyData: CompanyData, kpiConfig: KPIConfig,
  config: MethodologyConfig, scenario: Scenario,
): KPIAuditEntry {
  const kpiDef = KPI_REGISTRY[kpiConfig.id];
  if (!kpiDef) return skippedEntry(kpiConfig, `KPI '${kpiConfig.id}' not found in registry`);

  const inputsUsed: Record<string, number> = {};
  const inputTiers: DataSourceTier[] = [];
  const missing: string[] = [];

  for (const fieldName of kpiDef.requiredInputs) {
    const dp = companyData.fields[fieldName];
    if (!dp) { missing.push(fieldName); continue; }
    inputsUsed[fieldName] = dp.value;
    inputTiers.push(dp.confidence_tier);
  }

  if (missing.length > 0) return skippedEntry(kpiConfig, `Missing required inputs: ${missing.join(", ")}`);

  const benchmarkValue = kpiConfig.benchmark_ranges[scenario];
  const formulaInputs = { ...inputsUsed, [kpiDef.benchmarkInput]: benchmarkValue };

  let rawImpact: number;
  try {
    rawImpact = kpiDef.formula(formulaInputs);
  } catch (e) {
    return skippedEntry(kpiConfig, `Formula error: ${e}`);
  }

  const confidenceMultiplier = inputTiers.length > 0
    ? Math.min(...inputTiers.map((t) => getDiscount(config.confidence_discounts, t)))
    : config.confidence_discounts.estimated;

  const adjustedImpact = rawImpact * confidenceMultiplier;
  const weightedImpact = adjustedImpact * kpiConfig.weight;

  return {
    kpi_id: kpiConfig.id,
    kpi_label: kpiConfig.label || kpiDef.label,
    formula_description: kpiConfig.formula,
    inputs_used: inputsUsed,
    benchmark_value: benchmarkValue,
    benchmark_source: kpiConfig.benchmark_source,
    raw_impact: rawImpact,
    confidence_discount: confidenceMultiplier,
    adjusted_impact: adjustedImpact,
    weight: kpiConfig.weight,
    weighted_impact: weightedImpact,
    category: kpiDef.category,
    skipped: false,
  };
}

function projectMultiYear(totalAnnual: number, curve: number[]): YearProjection[] {
  let cumulative = 0;
  return curve.map((pct, i) => {
    const impact = totalAnnual * pct;
    cumulative += impact;
    return { year: i + 1, realization_percentage: pct, projected_impact: impact, cumulative_impact: cumulative };
  });
}

function skippedEntry(kpiConfig: KPIConfig, reason: string): KPIAuditEntry {
  return {
    kpi_id: kpiConfig.id, kpi_label: kpiConfig.label || kpiConfig.id,
    formula_description: kpiConfig.formula, inputs_used: {}, benchmark_value: 0,
    benchmark_source: kpiConfig.benchmark_source, raw_impact: 0, confidence_discount: 0,
    adjusted_impact: 0, weight: kpiConfig.weight, weighted_impact: 0,
    category: "unknown", skipped: true, skip_reason: reason,
  };
}
```

**Step 3: Commit**

```bash
git add frontend/src/lib/agent/kpi-formulas.ts frontend/src/lib/agent/calculation-engine.ts
git commit -m "feat: port calculation engine and KPI formulas to TypeScript"
```

---

## Task 4: Create TypeScript Agent SDK tools

**Files:**
- Create: `frontend/src/lib/agent/tools.ts`

**Step 1: Write custom tools using TS Agent SDK**

Port the 4 Python tools to TypeScript using `tool()` and `createSdkMcpServer()` from `@anthropic-ai/claude-agent-sdk`. Use Zod for input schemas.

Tools to port:
1. `load_methodology` — reads from Supabase `methodologies` table
2. `fetch_financials` — calls Valyu API for public company data
3. `scrape_company` — calls Firecrawl API for private company data
4. `run_calculation` — runs the TypeScript calculation engine

The Valyu and Firecrawl tools make HTTP calls to the respective APIs using `fetch()`. API keys come from environment variables.

Key patterns:
- All tools return `{ content: [{ type: "text", text: JSON.stringify(result) }] }`
- `run_calculation` accepts a `company_data` object (not string) with proper Zod schema
- `load_methodology` reads from Supabase instead of JSON file
- Use `z.object()` for all input schemas

**Step 2: Commit**

```bash
git add frontend/src/lib/agent/tools.ts
git commit -m "feat: create TypeScript Agent SDK custom tools"
```

---

## Task 5: Create the TypeScript orchestrator

**Files:**
- Create: `frontend/src/lib/agent/orchestrator.ts`

**Step 1: Write the orchestrator**

Port `backend/orchestrator/agent.py` to TypeScript using the TS Agent SDK. This is the core: it runs the agent loop with `query()`, emits SSE events via a callback, and returns results.

Key behaviors:
- Uses `query()` from `@anthropic-ai/claude-agent-sdk`
- Registers custom MCP server with all 4 tools
- Includes `WebSearch` and `WebFetch` in allowed tools
- System prompt includes current date (dynamic)
- Pre/post tool hooks emit SSE progress events
- Captures calculation result from tool output
- Assembles narrative from text blocks
- Returns `{ result, narrative, caseId }`

The SSE emission should work via a callback function passed in, so the API route can pipe events to the frontend.

**Step 2: Commit**

```bash
git add frontend/src/lib/agent/orchestrator.ts
git commit -m "feat: port orchestrator to TypeScript Agent SDK"
```

---

## Task 6: Replace Next.js API routes to use TS orchestrator

**Files:**
- Modify: `frontend/src/app/api/cases/route.ts`
- Modify: `frontend/src/app/api/cases/[caseId]/stream/route.ts`
- Delete (eventually): all Python backend files

**Step 1: Rewrite POST /api/cases**

The route should:
1. Validate input with Zod
2. Create case in Supabase
3. Start the TS orchestrator (streaming SSE events back)
4. Save results to Supabase when complete

Use Next.js streaming response (`ReadableStream`) to push SSE events as the agent works.

**Step 2: Rewrite GET /api/cases/[caseId]/stream**

This may become unnecessary if the POST route itself streams. Alternatively, the POST creates the case and returns the ID, and a separate SSE endpoint connects to a shared event emitter. Choose the simpler approach: POST returns caseId, SSE endpoint streams from an in-memory event queue.

**Step 3: Add environment variables to .env.local**

```
ANTHROPIC_API_KEY=your-key
VALYU_API_KEY=val_...
FIRECRAWL_API_KEY=fc-...
NEXT_PUBLIC_SUPABASE_URL=https://mzxwnekvuluzixshqxro.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

**Step 4: Commit**

```bash
git add frontend/src/app/api/
git commit -m "feat: wire API routes to TypeScript orchestrator, remove Python dependency"
```

---

## Task 7: Update frontend to remove Python backend dependency

**Files:**
- Modify: `frontend/src/app/api/methodologies/route.ts` — already reads from Supabase (done)
- Modify: `frontend/src/components/input-form/CaseInputForm.tsx` — may need updates if POST response changes
- Verify: SSE client, event stream hook, stores all still work with new event format

**Step 1: Verify methodologies page works**

The methodologies page already reads from Supabase directly. Verify it loads.

**Step 2: Verify case creation flow**

Test that:
1. Form submits to `/api/cases` POST
2. Returns caseId
3. SSE stream connects and receives events
4. Activity feed shows progress
5. Results render when complete

**Step 3: Remove Python backend proxy references**

Remove `BACKEND_URL` from `.env.local`. The frontend no longer needs to proxy to Python.

**Step 4: Commit**

```bash
git add frontend/
git commit -m "feat: frontend fully independent of Python backend"
```

---

## Task 8: Verify and test end-to-end

**Step 1: Run the app**

```bash
cd frontend && npm run dev
```

Only ONE server needed now.

**Step 2: Test methodologies page**

Navigate to `/methodologies`, verify KPIs load from Supabase.

**Step 3: Test case creation**

Enter a company name, verify:
- Activity feed shows tool calls
- Spinners stop when tools complete
- Calculation results render
- Narrative streams in
- Case saved to Supabase

**Step 4: Verify case persistence**

Refresh the page, verify the case is still accessible from Supabase.

**Step 5: Commit**

```bash
git add -A
git commit -m "test: verify end-to-end TypeScript Agent SDK pipeline"
```

---

## Task 9: Clean up Python backend

**Files:**
- Delete: `backend/` directory (or move to `_archive/`)
- Delete: `pyproject.toml`, `uv.lock` (Python project files)
- Modify: `CLAUDE.md` — update architecture section

**Step 1: Archive Python backend**

```bash
mv backend _archive_backend
```

Keep it around temporarily in case we need to reference anything.

**Step 2: Update CLAUDE.md**

Update the architecture section to reflect the new stack:
- No Python backend
- TypeScript Agent SDK in Next.js API routes
- Supabase for all data
- Deployable to Vercel

**Step 3: Commit**

```bash
git add -A
git commit -m "chore: archive Python backend, update architecture docs"
```

---

## Architecture Summary (After Migration)

```
Browser
  |
  v
Next.js (Vercel)
  ├── /                        → Home page (case input form)
  ├── /methodologies           → Reads from Supabase
  ├── /cases/[id]              → SSE stream + results from Supabase
  ├── /api/cases (POST)        → Creates case in Supabase, runs TS Agent SDK
  ├── /api/cases/[id]/stream   → SSE events from agent pipeline
  └── /api/methodologies       → Reads from Supabase
        |
        v
  TypeScript Agent SDK
  ├── Custom MCP Server (tools)
  │   ├── load_methodology  → Supabase query
  │   ├── fetch_financials  → Valyu API (HTTP)
  │   ├── scrape_company    → Firecrawl API (HTTP)
  │   └── run_calculation   → TypeScript calculation engine
  ├── Built-in: WebSearch, WebFetch
  └── Anthropic API (ANTHROPIC_API_KEY)
        |
        v
  Supabase (Postgres)
  ├── methodologies table
  ├── cases table
  └── audit_trail table
```
