# CPROI — Client Partner ROI Calculator

## Vision

A tool that empowers Client Partners (CPs) at a growth strategy consulting practice to generate data-backed, defensible ROI cases for prospective clients — with minimal input and full transparency. The practice specializes in **experience design** services.

## End Goal

CP enters a company name and industry vertical. The tool automatically pulls financial data, applies relevant industry benchmarks, runs ROI calculations, and produces a compelling narrative with a full audit trail. The CP can then present this to the client to justify engagement.

---

## Thoughts & Constraints

- **Three inputs:** Company name + industry vertical + service type (dropdown). For V1, service type is always "Experience Transformation & Design" — future versions will add more productized services.
- **Two data classes, visually distinct:**
  - **Company-specific data** — pulled from financial filings, earnings calls, Pitchbook/Crunchbase
  - **Benchmark/industry data** — sourced from vetted public research; always clearly marked as estimates
- **Audit-first design:** Every number must trace back to a source and calculation. "Show your work" is not optional — it's the core trust layer
- **Experience design focus:** KPIs and impact measurements must be relevant to CX/UX/experience design outcomes (not generic consulting ROI)
- **CP is the user, client is the audience:** The tool serves the CP, but the output must be client-facing quality
- **Progressive streaming UX:** CPs must see the agent working in real-time (similar to watching Claude think). No black-box loading screens. CPs are **amateur users** — the UX must be extremely clear and guided, never overwhelming.

---

## Use Cases

### UC1: Generate ROI Case for Public Company
CP enters "Nike" + "Retail/Apparel". Tool pulls 10-K revenue data, identifies experience-related metrics, applies industry benchmarks for CX impact, calculates estimated revenue at risk or opportunity, and produces a narrative with audit trail.

### UC2: Generate ROI Case for Private Company
CP enters "Warby Parker" (pre-IPO scenario) + "DTC Retail". Tool pulls available data from Pitchbook/Crunchbase (funding, estimated revenue), uses industry benchmarks more heavily to fill gaps, and flags lower confidence where data is estimated.

### UC3: Review and Adjust Calculations
CP receives generated output, opens the audit layer, sees that a benchmark conversion rate seems off for the client's sub-vertical, manually overrides it with a known figure, and the narrative recalculates.

### UC4: Export for Client Presentation
CP finalizes the ROI case and exports it in a format suitable for a proposal deck or email — clean narrative + supporting data.

---

## User Journeys

### Journey 1: First-Time ROI Generation
```
CP opens tool
  → Enters company name + industry vertical
  → System kicks off agent pipeline:
      1. Identify company type (public/private)
      2. Pull company financial data (revenue, growth, margins)
      3. Pull industry benchmarks (CX impact rates, conversion lifts, churn reduction)
      4. Run ROI calculations
      5. Generate headline narrative
      6. Assemble audit trail
  → CP sees: headline narrative + summary metrics + audit layer
  → CP reviews audit trail, adjusts if needed
  → CP exports or copies for proposal
```

### Journey 2: Audit & Override
```
CP views generated ROI case
  → Opens audit layer
  → Sees each data point with: source, date pulled, confidence level
  → Sees each calculation with: formula, inputs, output
  → Overrides a benchmark value with known client-specific data
  → Narrative and calculations update in real-time
  → CP locks in final version
```

### Journey 3: Compare Scenarios
```
CP generates base ROI case
  → Toggles between scenarios:
      - Conservative (lower-bound benchmarks)
      - Moderate (median benchmarks)
      - Aggressive (upper-bound benchmarks)
  → Selects the most appropriate framing for the client
```

---

## Architecture & Tech Stack

- **Agent framework:** Claude Agents SDK — orchestrates the multi-step data pull, benchmarking, calculation, and narrative generation
  - Runs **locally**, powered by Claude Max subscription (no separate API billing for now)
  - Built-in `WebSearch` + `WebFetch` tools handle industry benchmark research natively (no separate search API needed for MVP)
  - Custom Python tools for ROI calculations
  - Hooks system for audit logging
- **Public company financials:** Valyu.ai — unified API for SEC filings (10-K, 10-Q, 8-K), earnings, balance sheets, income statements, cash flow, ratios. Natural language queries, structured JSON output, Claude Agent SDK integration.
- **Private company data:** Firecrawl — AI-powered web scraper for Crunchbase/PitchBook pages. Natural language extraction (no brittle CSS selectors). Avoids $199/mo Crunchbase API.
- **Industry/CX benchmarks:** Claude itself via WebSearch + WebFetch (Agents SDK built-in). Can search for and cite Forrester, McKinsey, Baymard, etc. If quality proves insufficient, can add Perplexity Sonar later.
- **Frontend:** Next.js 15+ (App Router), shadcn/ui + Tremor (data viz), Recharts, Zustand, React Hook Form + Zod
- **Data persistence:** Supabase (PostgreSQL) — free tier, built-in auth, real-time, SQL audit trail
- **Export:** @react-pdf/renderer (PDF), pptxgenjs (PPTX)

### MVP External Dependencies (Just 2)
| Dependency | Purpose | Cost |
|-----------|---------|------|
| **Valyu.ai** | Public company financials + SEC filings | ~$8/1K financial queries, $10 free credits |
| **Firecrawl** | Private company data (scrape Crunchbase/PitchBook) | Pay-per-use |

Everything else (benchmark research, ROI calculations, narrative generation) is handled by Claude via the Agents SDK.

---

## Experience Design KPIs (To Refine)

These are the metrics the ROI calculations should model. Grouped by impact area:

### Revenue & Conversion
- **Conversion rate improvement** — % lift from better UX/CX
- **Average order value (AOV)** — impact of improved product discovery, recommendations
- **Cart abandonment reduction** — direct UX friction metric

### Retention & Loyalty
- **Customer churn rate** — reduction from improved experience
- **Customer lifetime value (CLV/LTV)** — downstream revenue impact
- **Net Promoter Score (NPS)** — experience quality proxy
- **Repeat purchase rate** — loyalty signal

### Efficiency & Cost
- **Customer support cost reduction** — fewer issues from better self-service UX
- **Task completion rate** — can users accomplish goals without help
- **Time-on-task reduction** — efficiency of core workflows

### Engagement
- **Digital engagement metrics** — session duration, pages per visit, feature adoption
- **Customer satisfaction (CSAT)** — direct experience quality measure
- **Customer effort score (CES)** — ease of doing business

### Brand & Market
- **Brand perception lift** — harder to quantify but relevant for premium positioning
- **Market share movement** — long-term outcome of sustained CX investment

> **Note:** Not all KPIs will apply to every client. The tool should select relevant KPIs based on industry vertical and available data.

---

## Methodology Engine

**Core principle:** Methodology is configuration (JSON), not code. A generic calculation engine interprets methodology configs — adding/modifying a methodology means writing JSON, not deploying code.

### Three Layers
1. **KPI Library** — shared pool of reusable KPI definitions (formulas, inputs, benchmark lookups)
2. **Methodology Configs** — select KPIs from library, set weights, benchmark ranges, narrative template. Varies by industry + service type.
3. **Calculation Engine** — generic runtime that processes any methodology config against company data

### How It Drives the Pipeline
The methodology config defines **what data to gather** — the agent only fetches what the active methodology's KPIs require. Config also selects narrative structure and confidence discounts.

### UX: Methodologies Section
- CPs can browse and view default methodologies (transparent, read-only)
- Full visibility into KPIs, weights, benchmark ranges, and sources
- Overrides happen at the individual ROI case level, not on the methodology itself
- Admin editing of methodology configs is a future capability

### Scaling
- **MVP**: 1 generic methodology config with reasonable defaults
- **V2**: Fork into 5+ service-type-specific configs (practice has 5+ productized services — exact mapping TBD)
- **V3**: Admin UI for methodology management

### Storage
Methodology configs stored as versioned JSONB in Supabase. Immutable once used in a case — new version created for edits (preserves audit reproducibility).

> See `research/methodology-engine-architecture.md` for full details + example config JSON.

---

## Decisions Made

- [x] **Finance data API → Valyu.ai** — unified API replaces FMP + SEC EDGAR + sec-api.io. Natural language SEC filing queries, structured JSON, Claude Agent SDK integration. Cheaper than multi-API stack.
- [x] **Private company data → Firecrawl** — AI web scraper for Crunchbase/PitchBook pages. Avoids $199/mo API cost. Schema-based extraction with natural language.
- [x] **Industry benchmarks → Claude (WebSearch/WebFetch)** — built into Agents SDK. No separate search API needed for MVP. Can add Perplexity Sonar later if quality is insufficient.
- [x] **Frontend → Next.js 15+** with shadcn/ui + Tremor
- [x] **Runtime → Local** — Claude Agents SDK runs locally, powered by Claude Max subscription. No cloud deployment for V1.
- [x] **UX → Progressive streaming** — CPs see agent working in real-time (like watching Claude think). No black-box loading. CPs are amateur users — UX must be extremely clear and guided.
- [x] **Service type → Third input (dropdown)** — V1 hardcoded to "Experience Transformation & Design". Future versions add more productized services.
- [x] **Methodology → Config-driven (JSON)** — generic engine interprets methodology configs. MVP ships with 1 generic config.

## Open Questions

- [ ] Auth/multi-tenancy? Multiple CPs using the same instance?
- [ ] Should the tool store past ROI cases for a CP to revisit?
- [ ] Valyu accuracy validation — 73% financial accuracy (self-reported). Need a confidence/validation layer.
- [ ] Firecrawl + Crunchbase TOS — scraping may need rate limiting and careful usage for production
- [ ] Service type taxonomy — practice has 5+ productized services; need to map these to methodology configs (bigger exercise, not for today)
