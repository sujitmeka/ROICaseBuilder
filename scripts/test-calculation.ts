/**
 * Quick validation script: run the calculation engine with realistic Nike data
 * and check if outputs are reasonable.
 *
 * Usage: npx tsx scripts/test-calculation.ts
 */

import { calculate } from "../src/lib/agent/calculation-engine";
import type { CompanyData, ImpactAssumptions, MethodologyConfig } from "../src/lib/agent/types";

// ---------------------------------------------------------------------------
// Realistic Nike data (FY2025, public filings)
// ---------------------------------------------------------------------------

const nikeData: CompanyData = {
  company_name: "Nike",
  industry: "ecommerce-retail",
  fields: {
    annual_revenue: { value: 46_000_000_000, confidence_tier: "company_reported", confidence_score: 0.95 },
    online_revenue: { value: 13_000_000_000, confidence_tier: "company_reported", confidence_score: 0.90 }, // ~28% digital
    order_volume: { value: 150_000_000, confidence_tier: "estimated", confidence_score: 0.6 },
    current_aov: { value: 87, confidence_tier: "industry_benchmark", confidence_score: 0.7 },
    current_churn_rate: { value: 0.35, confidence_tier: "industry_benchmark", confidence_score: 0.6 },
    customer_count: { value: 100_000_000, confidence_tier: "estimated", confidence_score: 0.5 },
    revenue_per_customer: { value: 460, confidence_tier: "estimated", confidence_score: 0.6 },
    current_support_contacts: { value: 20_000_000, confidence_tier: "estimated", confidence_score: 0.5 },
    cost_per_contact: { value: 8, confidence_tier: "industry_benchmark", confidence_score: 0.7 },
    repeat_purchase_rate: { value: 0.45, confidence_tier: "industry_benchmark", confidence_score: 0.6 },
    engagement_cost: { value: 300_000, confidence_tier: "company_reported", confidence_score: 1.0 },
  },
};

// ---------------------------------------------------------------------------
// Impact assumptions (what the AI would determine)
// ---------------------------------------------------------------------------

const impactAssumptions: ImpactAssumptions = {
  conversion_rate_lift: { conservative: 0.05, moderate: 0.10, aggressive: 0.18 },
  aov_increase: { conservative: 0.02, moderate: 0.05, aggressive: 0.10 },
  churn_reduction: { conservative: 0.08, moderate: 0.15, aggressive: 0.22 },
  support_cost_savings: { conservative: 0.15, moderate: 0.25, aggressive: 0.35 },
  nps_referral_revenue: { conservative: 0, moderate: 5, aggressive: 10 },
  repeat_purchase_uplift: { conservative: 0, moderate: 0.05, aggressive: 0.10 },
};

// ---------------------------------------------------------------------------
// Methodology config (matches Supabase v4.0)
// ---------------------------------------------------------------------------

const methodology: MethodologyConfig = {
  id: "experience-transformation-design",
  name: "Experience Transformation & Design",
  version: "4.0",
  description: "test",
  applicable_industries: ["all"],
  service_type: "experience-transformation-design",
  realization_curve: [0.4, 0.7, 0.9],
  kpis: [
    { id: "conversion_rate_lift", label: "Conversion Rate Improvement", formula: "online_revenue * lift_percentage", inputs: ["online_revenue"], enabled: true, typical_range: { low: 0.05, high: 0.35 }, reasoning_guidance: "", reference_sources: [] },
    { id: "aov_increase", label: "AOV Increase", formula: "order_volume * (current_aov * lift_percentage)", inputs: ["order_volume", "current_aov"], enabled: true, typical_range: { low: 0.03, high: 0.2 }, reasoning_guidance: "", reference_sources: [] },
    { id: "churn_reduction", label: "Churn Reduction", formula: "churn * reduction * count * rev", inputs: ["current_churn_rate", "customer_count", "revenue_per_customer"], enabled: true, typical_range: { low: 0.05, high: 0.25 }, reasoning_guidance: "", reference_sources: [] },
    { id: "support_cost_savings", label: "Support Cost Savings", formula: "contacts * reduction * cost", inputs: ["current_support_contacts", "cost_per_contact"], enabled: true, typical_range: { low: 0.1, high: 0.4 }, reasoning_guidance: "", reference_sources: [] },
    { id: "nps_referral_revenue", label: "NPS Referral Revenue", formula: "nps model", inputs: ["customer_count", "revenue_per_customer"], enabled: true, typical_range: { low: 3, high: 15 }, reasoning_guidance: "", reference_sources: [] },
    { id: "repeat_purchase_uplift", label: "Repeat Purchase Uplift", formula: "count * rev * rate * lift", inputs: ["customer_count", "revenue_per_customer", "repeat_purchase_rate"], enabled: true, typical_range: { low: 0.03, high: 0.15 }, reasoning_guidance: "", reference_sources: [] },
  ],
};

// ---------------------------------------------------------------------------
// Run and display
// ---------------------------------------------------------------------------

const result = calculate(nikeData, methodology, impactAssumptions, {
  serviceType: "experience-transformation-design",
  serviceTiers: [
    { name: "CORE", price_range: { low: 150000, high: 200000 }, attribution_range: { low: 0.08, high: 0.15 } },
    { name: "EXPANDED", price_range: { low: 275000, high: 350000 }, attribution_range: { low: 0.15, high: 0.30 } },
    { name: "ENTERPRISE", price_range: { low: 400000, high: 500000 }, attribution_range: { low: 0.25, high: 0.45 } },
  ],
});

console.log("\n=== NIKE ROI CALCULATION TEST ===\n");
console.log(`Company: ${result.company_name}`);
console.log(`Data completeness: ${(result.data_completeness * 100).toFixed(0)}%`);
console.log(`Missing inputs: ${result.missing_inputs.length > 0 ? result.missing_inputs.join(", ") : "none"}`);
if (result.warnings.length > 0) console.log(`Warnings: ${result.warnings.join("; ")}`);
console.log();

for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
  const s = result.scenarios[scenario];
  console.log(`--- ${scenario.toUpperCase()} ---`);

  // KPI breakdown
  for (const kpi of s.kpi_results) {
    if (kpi.skipped) {
      console.log(`  ${kpi.kpi_label}: SKIPPED (${kpi.skip_reason})`);
    } else {
      const capped = kpi.capped_impact !== undefined ? ` → capped to $${fmt(kpi.capped_impact)}` : "";
      console.log(`  ${kpi.kpi_label}: $${fmt(kpi.raw_impact)} (${(kpi.impact_assumption * 100).toFixed(1)}% impact)${capped}`);
    }
  }

  console.log();
  console.log(`  Gross annual impact: $${fmt(s.gross_annual_impact ?? 0)}`);

  if (s.overlap_adjustment) {
    const oa = s.overlap_adjustment;
    console.log(`  Overlap discount: ${(oa.overlap_discount_pct * 100).toFixed(1)}% (${oa.offensive_driver_count} offensive drivers → ${oa.offensive_discount}x)`);
    console.log(`  After overlap: $${fmt(oa.adjusted_total)}`);
  }

  if (s.realism_caps) {
    const rc = s.realism_caps;
    if (rc.per_driver_caps_applied.length > 0 || rc.total_cap_applied) {
      console.log(`  Caps applied: ${rc.cap_footnotes.join("; ")}`);
    }
    console.log(`  Final annual impact: $${fmt(rc.post_cap_impact)}`);
  }

  console.log(`  3-year cumulative: $${fmt(s.cumulative_3yr_impact)}`);

  if (s.investment_breakdown) {
    const inv = s.investment_breakdown;
    console.log(`  Investment: $${fmt(inv.consulting_fee)} consulting + $${fmt(inv.implementation_cost)} impl = $${fmt(inv.total_investment)} (${inv.estimation_method}, ${inv.multiplier_used}x)`);
  }

  if (s.attribution_factor !== undefined) {
    console.log(`  Attribution factor: ${(s.attribution_factor * 100).toFixed(0)}% (pre-attribution: $${fmt(s.pre_attribution_impact ?? 0)})`);
  }

  console.log(`  ROI: ${s.roi_multiple?.toFixed(1)}x (${s.roi_percentage?.toFixed(0)}%)`);
  console.log(`  Skipped KPIs: ${s.skipped_kpis.length > 0 ? s.skipped_kpis.join(", ") : "none"}`);

  if (s.realism_caps?.weak_case_flag) {
    console.log(`  ⚠️  WEAK CASE FLAG`);
  }
  console.log();
}

// Sanity checks
console.log("=== SANITY CHECKS ===\n");
const rev = nikeData.fields.annual_revenue.value;
for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
  const s = result.scenarios[scenario];
  const pctOfRev = (s.total_annual_impact / rev) * 100;
  const reasonable = pctOfRev <= 15;
  console.log(`${scenario}: $${fmt(s.total_annual_impact)} = ${pctOfRev.toFixed(2)}% of revenue ${reasonable ? "✅" : "❌ SUSPICIOUS"}`);
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
