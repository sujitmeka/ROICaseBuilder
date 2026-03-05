---
name: roi-financial-modeling
description: Use when estimating financial impact or ROI for a consulting engagement, before running any calculations or generating dollar figures. Covers experience transformation, org redesign, new product development, and other advisory services.
---

# ROI Financial Modeling for Consulting Engagements

## Overview

**Core principle:** Scope the addressable base first, then estimate improvement on that scoped base. Never apply improvement percentages to total company revenue and "correct" with attribution factors afterward.

The wrong approach: "Nike has $46B revenue, 10% conversion lift = $4.6B, multiply by 12% attribution = $552M." This is backwards math — you're inflating then deflating, and the result is an artifact of your correction factor, not analysis.

The right approach: "This engagement targets Nike.com checkout flow, which handles ~$5B/yr. A 10% conversion lift on that specific flow = $500M." The number is grounded because the base was scoped to what the engagement actually touches.

## When to Use

- Estimating dollar impact of ANY consulting engagement
- Generating ROI projections for client proposals
- Building financial models for experience transformation, org redesign, new product dev, or other advisory services
- Whenever you're about to multiply a percentage improvement by a revenue number

**When NOT to use:**
- Pure cost reduction exercises with known line items (just subtract)
- Pricing/rate card decisions (different exercise)

## The 8 Steps

Follow these sequentially. Do NOT skip steps. Each step builds on the previous.

### Step 1: Understand the Engagement

Before any numbers, answer:

- **What service/product are we offering?** (e.g., experience transformation, org redesign, new product strategy)
- **What does this service actually change?** Not in theory — what specific business processes, customer journeys, or operational flows will be different after this engagement?
- **What is the client's industry?** Industry determines which KPIs matter and what benchmarks are credible.
- **What tier/scope of engagement?** (e.g., diagnostic vs. full transformation — this determines how much of the business we can realistically affect)

This step determines everything downstream. A $150K diagnostic touching one journey is fundamentally different from a $500K enterprise redesign touching the full customer lifecycle.

### Step 2: Source Company Data

Gather financial and operational data. For each data point, note:

- **Source**: Company-reported (10-K, earnings call), industry benchmark, or estimate
- **Confidence**: How reliable is this number?
- **Recency**: When was this data from?

Priority data (attempt in order):
1. Annual revenue, revenue by segment/channel (from filings)
2. Digital/online revenue specifically (from filings or estimates)
3. Order volume, AOV, customer count (filings or benchmarks)
4. Operational metrics: support contacts, churn rate, repeat purchase rate (usually benchmarks)

**Critical rule:** If you can't find a number, use an industry benchmark and FLAG IT. Never silently invent data.

### Step 3: Scope the Addressable Base

**This is the most important step and the one most often skipped.**

Ask: "What specific slice of the business does this engagement actually touch?"

The addressable base is NOT total company revenue. It is the revenue (or cost base) flowing through the specific journeys, channels, or processes the engagement will redesign.

**How to scope by service type:**

| Service Type | Addressable Base = |
|---|---|
| Experience Transformation | Revenue through the specific journey(s) being redesigned (e.g., checkout flow, onboarding funnel, mobile app purchase path) |
| Org Redesign | Headcount cost + productivity output of the functions being restructured |
| New Product Development | TAM slice for the specific market segment being targeted |
| Digital Transformation | Revenue/cost flowing through the systems being replaced or modernized |

**Scoping by engagement tier:**

| Tier | Typical Scope |
|---|---|
| Diagnostic / CORE | 1 priority journey or function. Addressable base = revenue through that ONE journey. |
| Targeted / EXPANDED | 2-3 priority journeys. Addressable base = combined revenue through those journeys. |
| Enterprise | Full customer lifecycle or multiple business units. Addressable base = broader (but still not total company revenue unless engagement truly spans everything). |

**Example — Nike Experience Transformation (CORE tier):**
- Nike total revenue: $46B
- Nike.com direct revenue: ~$13B
- The CORE engagement focuses on the mobile checkout experience
- Mobile checkout handles maybe 40% of digital orders: ~$5.2B
- **Addressable base: $5.2B** (not $46B, not $13B)

**Example — Regional bank Org Redesign (EXPANDED tier):**
- Bank total revenue: $2B
- Engagement restructures the retail lending division
- Retail lending revenue: $400M, staff cost: $45M
- **Addressable base: $400M revenue + $45M cost base**

Document your scoping logic explicitly. This is the single most important assumption in the entire model.

### Step 4: Estimate Improvement Potential

Now apply improvement percentages — but ONLY to the scoped addressable base from Step 3.

For each KPI:
1. What is the current performance level? (from Step 2 data)
2. What improvement is realistic given the engagement scope? (from benchmarks and reasoning)
3. Apply the improvement to the SCOPED base, not total revenue.

**Benchmark sourcing hierarchy:**
1. Client's own historical data (if available)
2. Direct competitors' published results
3. Industry-specific research (Forrester, McKinsey, Baymard)
4. Cross-industry benchmarks (least preferred, widen confidence interval)

**Scenario construction:**
- **Conservative**: Bottom quartile of benchmark range. Assume execution friction, partial adoption.
- **Moderate**: Median of benchmark range. Assume competent execution with normal organizational resistance.
- **Aggressive**: Top quartile. Assume strong executive sponsorship, clean implementation, full adoption.

**Per-KPI example on scoped base:**
- Addressable base: $5.2B (Nike mobile checkout)
- Conversion rate lift: conservative 3%, moderate 6%, aggressive 10%
- Conservative impact: $5.2B * 0.03 = $156M
- Moderate impact: $5.2B * 0.06 = $312M
- Aggressive impact: $5.2B * 0.10 = $520M

### Step 5: Document Critical Assumptions

Every model has assumptions. The difference between a credible model and a fantasy is whether assumptions are visible.

For each scenario, explicitly state:
- **Addressable base assumption**: Why this slice? What's included/excluded?
- **Improvement rate assumption**: Where did this percentage come from? What benchmark?
- **Timeline assumption**: When does impact begin? Full ramp takes how long?
- **Independence assumption**: Are KPIs truly independent or do they overlap? (e.g., conversion lift and AOV increase may share the same underlying UX change)
- **What could make this wrong**: What would have to be true for this estimate to be off by 2x or more?

**Overlap handling:**
If multiple KPIs are "offensive" (revenue-driving) and stem from the same underlying change, apply an overlap discount. Two revenue KPIs from the same journey redesign are not fully additive — use 80-90% of the sum. Three or more, use 70-80%.

### Step 6: Size the Full Investment

The denominator in ROI is not just the consulting fee. Include:

| Cost Component | How to Estimate |
|---|---|
| Consulting/advisory fee | Known (from tier pricing) |
| Client internal team time | # of people * % allocation * loaded cost * duration |
| Technology/tooling changes | If engagement recommends tech changes, estimate implementation |
| Change management | Training, comms, process documentation |
| Opportunity cost | What else could the team be doing? (usually qualitative) |

**For proposal-stage estimates** (when you don't know client internals):
- Use a multiplier on consulting fee: 2-4x for CORE, 3-5x for EXPANDED, 4-6x for ENTERPRISE
- Flag this as an estimate and note it's typically the most uncertain part of the model

### Step 7: Calculate ROI

With scoped impact (Step 4) and full investment (Step 6):

```
Annual Impact = Sum of KPI impacts (after overlap adjustment)
3-Year Impact = Year 1 (partial realization) + Year 2 (fuller) + Year 3 (full)
ROI Multiple = 3-Year Impact / Total Investment
ROI Percentage = (3-Year Impact - Total Investment) / Total Investment * 100
```

**Realization curve** (impact doesn't appear instantly):
- Year 1: 30-50% of full annual impact (implementation + adoption ramp)
- Year 2: 60-80% (organizational learning, optimization)
- Year 3: 80-100% (full steady state)

### Step 8: Sanity Check

Before presenting ANY number, verify:

| Check | Threshold | If Exceeded |
|---|---|---|
| Annual impact as % of addressable base | Should be < 15% | Re-examine improvement assumptions — you're claiming to move the needle more than most transformations achieve |
| Annual impact as % of total revenue | Should be < 5% | If a single engagement claims >5% of total company revenue, something is likely wrong with scoping |
| ROI multiple (3-year) | Conservative < 10x, Moderate < 20x, Aggressive < 35x | Re-examine investment sizing or scoping — very high multiples suggest the investment denominator is too small relative to the addressable base |
| Per-KPI impact | No single KPI > 60% of total impact | Over-reliance on one driver makes the case fragile |
| Improvement rates | Within published benchmark ranges | If your assumed lift exceeds the top of the benchmark range, you need extraordinary justification |

**If sanity checks fail:**
Do NOT just cap the number. Go back to Step 3 and re-examine your addressable base scoping. The most common cause of absurd outputs is an insufficiently scoped base.

## Where Product-Specific Knowledge Enters

The 8 steps are universal. What changes per service type:

| Step | What Changes |
|---|---|
| Step 1 | What the service changes (journeys vs. org structure vs. market entry) |
| Step 3 | How to scope addressable base (see table above) |
| Step 4 | Which KPIs matter and what benchmarks apply |
| Step 5 | What assumptions are most uncertain for this service type |
| Step 6 | What non-consulting costs are typical |

The methodology config should encode this product-specific knowledge — specifically the scoping logic, relevant KPIs, and benchmark ranges. The 8-step process itself stays the same.

## Common Mistakes

| Mistake | Why It's Wrong | Fix |
|---|---|---|
| Apply % to total revenue | Engagement doesn't touch all revenue | Scope addressable base first (Step 3) |
| Use "attribution factor" to correct inflated numbers | You're admitting the base number is wrong and patching it | Fix the base number instead |
| Cap ROI to make it look reasonable | Caps hide bad methodology | Fix the methodology so caps rarely fire |
| Ignore overlap between KPIs | Double-counting inflates impact | Apply overlap discount for same-source KPIs |
| Only count consulting fee as investment | Understates denominator, inflates ROI | Include full investment (Step 6) |
| Present single-point estimates | False precision | Always present ranges (3 scenarios) |
| Use cross-industry benchmarks without discount | "Average" across industries is meaningless | Prefer industry-specific, discount cross-industry |
| Skip the sanity check | "The model says so" is not an argument | Always run Step 8 before presenting |

## Real-World Calibration

For a $300-500K experience transformation engagement at a large enterprise:
- Addressable base: typically $500M - $5B (one or a few digital journeys, not all revenue)
- Annual impact: typically $15M - $150M (3-10% of addressable base)
- 3-year cumulative: $30M - $350M (with realization curve)
- ROI: typically 5-25x over 3 years
- These are the ranges a CFO would find credible. Outside these ranges, scrutinize your assumptions.
