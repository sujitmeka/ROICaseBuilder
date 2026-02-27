# Methodology Engine Architecture

> Research completed 2026-02-27. Reference notes — not a final plan.

## Core Concept: Methodology as Configuration, Not Code

The ROI calculation methodology varies by industry, service type, and client context. Rather than hardcoding formulas, the system treats methodologies as **data (JSON configs)** interpreted by a generic calculation engine.

## Three-Layer Architecture

### Layer 1: KPI Library (Shared Atoms)
A pool of every KPI the system knows about. Each KPI is a reusable definition:
- ID, label, description
- Formula (expressed as a string or function reference)
- Required inputs (what company data it needs)
- How to look up benchmarks
- Default benchmark ranges (conservative / moderate / aggressive)

Examples: `conversion_rate_lift`, `churn_reduction`, `support_cost_savings`, `nps_referral_revenue`, `aov_increase`

### Layer 2: Methodology Configs (Composable Molecules)
Each methodology selects KPIs from the library, sets weights, defines benchmark ranges, and chooses narrative structure. **This is what varies by industry + service type.**

A methodology config includes:
- `id`, `name`, `version`
- `applicable_industries` — which verticals this applies to
- `service_type` — which productized service this maps to
- `kpis[]` — which KPIs are active, their weights, benchmark ranges, sources
- `realization_curve` — Year 1/2/3 impact percentages
- `narrative_template` — which narrative structure to use (SCR, defensive, growth)
- `confidence_discounts` — multipliers by data quality tier
- `enabled` — can be toggled on/off

### Layer 3: Calculation Engine (Generic Runtime)
Takes (a) company data inputs + (b) methodology config → runs the math:
1. Iterates through enabled KPIs in the config
2. For each KPI: fills inputs from company data, applies benchmark range for selected scenario
3. Applies confidence discounts based on data source quality
4. Applies realization curve for multi-year projection
5. Sums total impact
6. Generates audit trail for every step

**The engine doesn't know what KPIs exist — it just processes whatever the config defines.**

## Example Methodology Config

```json
{
  "id": "cx-redesign-ecommerce",
  "name": "CX Redesign — E-commerce/Retail",
  "version": "1.0",
  "applicable_industries": ["ecommerce", "retail", "dtc"],
  "service_type": "cx-redesign",

  "kpis": [
    {
      "id": "conversion_rate_lift",
      "label": "Conversion Rate Improvement",
      "weight": 0.35,
      "formula": "current_online_revenue * lift_percentage",
      "inputs": ["current_online_revenue", "current_conversion_rate"],
      "benchmark_ranges": {
        "conservative": 0.10,
        "moderate": 0.20,
        "aggressive": 0.35
      },
      "benchmark_source": "Baymard Institute 2025",
      "enabled": true
    },
    {
      "id": "churn_reduction",
      "label": "Revenue Saved from Churn Reduction",
      "weight": 0.25,
      "formula": "current_churn_rate * reduction_pct * customer_count * revenue_per_customer",
      "inputs": ["current_churn_rate", "customer_count", "revenue_per_customer"],
      "benchmark_ranges": {
        "conservative": 0.05,
        "moderate": 0.15,
        "aggressive": 0.25
      },
      "benchmark_source": "Temkin Group / Vitally",
      "enabled": true
    }
  ],

  "realization_curve": [0.40, 0.70, 0.90],
  "narrative_template": "scr_cfo",

  "confidence_discounts": {
    "company_reported": 1.0,
    "industry_benchmark": 0.8,
    "cross_industry": 0.6,
    "estimated": 0.4
  }
}
```

## How It Drives the Agent Pipeline

```
CP enters company + industry + service type
  → System selects matching methodology config (or falls back to generic)
  → Methodology config defines WHAT data to gather
  → Financial Data Agent fetches company inputs listed in config's KPI inputs
  → Benchmark Research Agent fills gaps for KPIs where company data is missing
  → Calculation Engine runs config against gathered data
  → Narrative Agent generates story from config's narrative_template
  → Everything logged to audit trail with source + confidence
```

Key insight: **the methodology config drives data gathering**, not the other way around. The agent only fetches what the active methodology needs.

## UX: Methodologies Section

CPs should have visibility into methodology configs:
- **Browse default methodologies** — see what's available per industry/service type
- **View KPIs, weights, benchmark ranges** — full transparency into how calculations work
- **Cannot edit defaults** — but can see exactly what drives the numbers
- **Overrides at case level** — CP can override any value when generating a specific ROI case
- **Admin/practice-level editing** — separate admin flow for creating/modifying methodology configs (future)

This maps to the 3-layer audit trail UX:
- Layer 1 (Narrative) shows the results
- Layer 2 (Calculation) shows which methodology was used and how
- Layer 3 (Source) shows where each benchmark/input came from

## Scaling Plan

- **MVP**: 1 generic methodology config (works across industries with reasonable defaults)
- **V2**: Fork into 5+ service-type-specific configs as the practice defines them
- **V3**: Admin UI for creating/editing methodology configs without code changes
- **Future**: CP-facing methodology browser in the app

## Storage

Methodology configs stored in Supabase as versioned JSON:
- `methodologies` table: id, name, version, config (JSONB), created_at, updated_at, is_default
- Audit trail references which methodology version was used for each ROI case
- Configs are immutable once used — new version created for edits (preserves reproducibility)

## Service Types (TBD — 5+ expected)

The practice has productized services but the exact list needs exploration. Each service type will eventually map to one or more methodology configs. This is a bigger design exercise to tackle separately.

## Key Design Principles

1. **Transparent by default** — CPs can always see what methodology is being used and why
2. **Config over code** — adding a new methodology = writing JSON, not deploying code
3. **Immutable audit** — once a methodology is used in a case, that version is frozen in the audit trail
4. **Progressive complexity** — start generic, fork as you learn what varies
5. **Override-friendly** — CPs can override any value; overrides are tracked, not hidden
