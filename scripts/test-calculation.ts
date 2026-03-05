/**
 * Quick validation script: test the calculation validator with realistic Nike data.
 * This simulates what the LLM would pass after doing its own calculations.
 *
 * Usage: npx tsx scripts/test-calculation.ts
 */

import { validate } from "../src/lib/agent/calculation-engine";

// ---------------------------------------------------------------------------
// Simulate what the LLM would produce after following the 8-step framework
// ---------------------------------------------------------------------------

const result = validate({
  company_name: "Nike",
  industry: "retail",
  addressable_base: {
    value: 5_200_000_000,
    label: "Mobile checkout revenue (40% of $13B digital)",
  },
  total_revenue: 46_000_000_000,
  realization_curve: [0.4, 0.7, 0.9],
  scenarios: {
    conservative: {
      kpis: [
        {
          id: "conversion_rate_lift",
          label: "Conversion Rate Improvement",
          category: "offensive",
          inputs: { addressable_revenue: 5_200_000_000, lift_pct: 0.03 },
          formula: "addressable_revenue * lift_pct",
          claimed_impact: 156_000_000,
        },
        {
          id: "support_cost_savings",
          label: "Support Cost Savings",
          category: "efficiency",
          inputs: { support_contacts: 2_000_000, cost_per_contact: 8, reduction_pct: 0.15 },
          formula: "support_contacts * cost_per_contact * reduction_pct",
          claimed_impact: 2_400_000,
        },
      ],
      overlap_adjustment_pct: 0,
      investment: { consulting_fee: 200_000, implementation_cost: 600_000, total: 800_000 },
    },
    moderate: {
      kpis: [
        {
          id: "conversion_rate_lift",
          label: "Conversion Rate Improvement",
          category: "offensive",
          inputs: { addressable_revenue: 5_200_000_000, lift_pct: 0.06 },
          formula: "addressable_revenue * lift_pct",
          claimed_impact: 312_000_000,
        },
        {
          id: "aov_increase",
          label: "AOV Increase",
          category: "offensive",
          inputs: { order_volume: 20_000_000, current_aov: 87, lift_pct: 0.04 },
          formula: "order_volume * current_aov * lift_pct",
          claimed_impact: 69_600_000,
        },
        {
          id: "support_cost_savings",
          label: "Support Cost Savings",
          category: "efficiency",
          inputs: { support_contacts: 2_000_000, cost_per_contact: 8, reduction_pct: 0.25 },
          formula: "support_contacts * cost_per_contact * reduction_pct",
          claimed_impact: 4_000_000,
        },
      ],
      overlap_adjustment_pct: 0.10,
      investment: { consulting_fee: 200_000, implementation_cost: 600_000, total: 800_000 },
    },
    aggressive: {
      kpis: [
        {
          id: "conversion_rate_lift",
          label: "Conversion Rate Improvement",
          category: "offensive",
          inputs: { addressable_revenue: 5_200_000_000, lift_pct: 0.10 },
          formula: "addressable_revenue * lift_pct",
          claimed_impact: 520_000_000,
        },
        {
          id: "aov_increase",
          label: "AOV Increase",
          category: "offensive",
          inputs: { order_volume: 20_000_000, current_aov: 87, lift_pct: 0.08 },
          formula: "order_volume * current_aov * lift_pct",
          claimed_impact: 139_200_000,
        },
        {
          id: "churn_reduction",
          label: "Churn Reduction",
          category: "defensive",
          inputs: { customer_count: 10_000_000, revenue_per_customer: 130, churn_rate: 0.35, reduction_pct: 0.15 },
          formula: "customer_count * revenue_per_customer * churn_rate * reduction_pct",
          claimed_impact: 68_250_000,
        },
        {
          id: "support_cost_savings",
          label: "Support Cost Savings",
          category: "efficiency",
          inputs: { support_contacts: 2_000_000, cost_per_contact: 8, reduction_pct: 0.35 },
          formula: "support_contacts * cost_per_contact * reduction_pct",
          claimed_impact: 5_600_000,
        },
      ],
      overlap_adjustment_pct: 0.15,
      investment: { consulting_fee: 200_000, implementation_cost: 600_000, total: 800_000 },
    },
  },
});

// ---------------------------------------------------------------------------
// Display results
// ---------------------------------------------------------------------------

console.log("\n=== NIKE ROI VALIDATION TEST ===\n");
console.log(`Company: ${result.company_name}`);
console.log(`Addressable base: $${fmt(5_200_000_000)}`);

if (result.validation_warnings.length > 0) {
  console.log("\nValidation warnings:");
  for (const w of result.validation_warnings) {
    const prefix = w.type === "arithmetic_error" ? "ARITHMETIC" : w.type === "sanity_check" ? "SANITY" : "WEAK";
    console.log(`  [${prefix}] ${w.message}`);
  }
}

console.log();

for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
  const s = result.scenarios[scenario];
  if (!s) continue;
  console.log(`--- ${scenario.toUpperCase()} ---`);

  for (const kpi of s.kpi_results) {
    if (kpi.skipped) {
      console.log(`  ${kpi.kpi_label}: SKIPPED (${kpi.skip_reason})`);
    } else {
      console.log(`  ${kpi.kpi_label}: $${fmt(kpi.raw_impact)} [${kpi.formula_description}]`);
    }
  }

  console.log();
  console.log(`  Gross total: $${fmt(s.gross_annual_impact ?? 0)}`);
  if (s.overlap_adjustment) {
    console.log(`  After ${(s.overlap_adjustment.overlap_discount_pct * 100).toFixed(0)}% overlap: $${fmt(s.overlap_adjustment.adjusted_total)}`);
  }
  console.log(`  Annual impact: $${fmt(s.total_annual_impact)}`);
  console.log(`  3-year cumulative: $${fmt(s.cumulative_3yr_impact)}`);

  if (s.investment_breakdown) {
    const inv = s.investment_breakdown;
    console.log(`  Investment: $${fmt(inv.consulting_fee)} + $${fmt(inv.implementation_cost)} = $${fmt(inv.total_investment)}`);
  }

  console.log(`  ROI: ${s.roi_multiple?.toFixed(1)}x (${s.roi_percentage?.toFixed(0)}%)`);
  console.log();
}

// Sanity checks
console.log("=== SANITY CHECKS ===\n");
const rev = 46_000_000_000;
const base = 5_200_000_000;
for (const scenario of ["conservative", "moderate", "aggressive"] as const) {
  const s = result.scenarios[scenario];
  if (!s) continue;
  const pctOfRev = (s.total_annual_impact / rev) * 100;
  const pctOfBase = (s.total_annual_impact / base) * 100;
  const revOk = pctOfRev <= 5;
  const baseOk = pctOfBase <= 15;
  console.log(
    `${scenario}: $${fmt(s.total_annual_impact)} = ${pctOfBase.toFixed(1)}% of base ${baseOk ? "OK" : "HIGH"}, ` +
    `${pctOfRev.toFixed(2)}% of revenue ${revOk ? "OK" : "HIGH"}, ` +
    `ROI ${s.roi_multiple?.toFixed(1)}x`
  );
}

function fmt(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
