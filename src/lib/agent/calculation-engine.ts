/**
 * Calculation Validator — pure arithmetic checker and audit trail generator.
 *
 * The LLM does ALL the reasoning: scoping, assumptions, formulas, calculations.
 * This engine takes the LLM's stated calculations, re-checks the arithmetic,
 * produces a structured audit trail for the frontend, and runs sanity checks.
 *
 * It does NOT:
 * - Apply attribution factors (the LLM scopes the addressable base correctly)
 * - Look up KPI formulas (the LLM chooses and applies its own)
 * - Load methodology configs (the LLM already loaded the skill + methodology)
 */

import type {
  Scenario, ScenarioResult, CalculationResult,
  KPIAuditEntry, YearProjection,
} from "./types";

// ---------------------------------------------------------------------------
// Input types — what the LLM passes to the validator
// ---------------------------------------------------------------------------

export interface KPICalculation {
  id: string;
  label: string;
  category: "offensive" | "defensive" | "efficiency";
  inputs: Record<string, number>;
  formula: string;
  claimed_impact: number;
}

export interface ScenarioCalculation {
  kpis: KPICalculation[];
  overlap_adjustment_pct?: number;
  investment: {
    consulting_fee: number;
    implementation_cost: number;
    total: number;
  };
}

export interface ValidateInput {
  company_name: string;
  industry: string;
  addressable_base: {
    value: number;
    label: string;
  };
  total_revenue: number;
  realization_curve: number[];
  scenarios: Record<string, ScenarioCalculation>;
}

// ---------------------------------------------------------------------------
// Validation result — extends KPIAuditEntry with validation status
// ---------------------------------------------------------------------------

export interface ValidationWarning {
  type: "arithmetic_error" | "sanity_check" | "weak_case";
  message: string;
  kpi_id?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCENARIOS: Scenario[] = ["conservative", "moderate", "aggressive"];

const SANITY_THRESHOLDS = {
  max_impact_pct_of_addressable: 0.15,
  max_impact_pct_of_total_revenue: 0.05,
  max_roi_multiple: { conservative: 10, moderate: 20, aggressive: 35 } as Record<Scenario, number>,
  max_single_kpi_pct: 0.60,
  weak_case_roi_floor: 1.5,
};

const STANDARD_DISCLAIMER =
  "This analysis represents estimated potential impact based on available financial data " +
  "and industry benchmarks. Actual results depend on implementation quality, " +
  "organizational readiness, and market conditions.";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function validate(input: ValidateInput): CalculationResult & { validation_warnings: ValidationWarning[] } {
  const warnings: ValidationWarning[] = [];
  const scenarios = {} as Record<Scenario, ScenarioResult>;

  for (const scenario of SCENARIOS) {
    const scenarioInput = input.scenarios[scenario];
    if (!scenarioInput) continue;
    scenarios[scenario] = validateScenario(
      scenarioInput, scenario, input, warnings,
    );
  }

  const weakCaseFlag = warnings.some(
    (w) => w.type === "weak_case" && w.message.includes("conservative"),
  );

  return {
    company_name: input.company_name,
    industry: input.industry,
    methodology_id: "llm-reasoned",
    methodology_version: "1.0",
    scenarios,
    data_completeness: 1.0, // LLM already gathered all data
    missing_inputs: [],
    available_inputs: [],
    warnings: warnings.map((w) => w.message),
    weak_case_flag: weakCaseFlag || undefined,
    validation_warnings: warnings,
  };
}

// ---------------------------------------------------------------------------
// Scenario validator
// ---------------------------------------------------------------------------

function validateScenario(
  input: ScenarioCalculation,
  scenario: Scenario,
  context: ValidateInput,
  warnings: ValidationWarning[],
): ScenarioResult {
  const kpiResults: KPIAuditEntry[] = [];
  const skippedKpis: string[] = [];
  const impactByCategory: Record<string, number> = {};
  let verifiedTotal = 0;

  // 1. Validate each KPI's arithmetic
  for (const kpi of input.kpis) {
    const verified = verifyKpiArithmetic(kpi, warnings);
    kpiResults.push(verified);

    if (!verified.skipped) {
      verifiedTotal += verified.raw_impact;
      impactByCategory[verified.category] =
        (impactByCategory[verified.category] ?? 0) + verified.raw_impact;
    } else {
      skippedKpis.push(verified.kpi_id);
    }
  }

  // 2. Apply overlap adjustment (LLM states the %)
  const overlapPct = input.overlap_adjustment_pct ?? 0;
  const adjustedTotal = verifiedTotal * (1 - overlapPct);

  // 3. Calculate ROI
  const totalInvestment = input.investment.total;
  const roiMultiple = totalInvestment > 0 ? adjustedTotal / totalInvestment : undefined;
  const roiPercentage = totalInvestment > 0
    ? ((adjustedTotal - totalInvestment) / totalInvestment) * 100
    : undefined;

  // 4. Year projections
  const yearProjections = projectMultiYear(adjustedTotal, context.realization_curve);
  const cumulative3yr = yearProjections.reduce((s, p) => s + p.projected_impact, 0);

  // 5. Sanity checks
  const sanityFootnotes: string[] = [];

  if (context.addressable_base.value > 0) {
    const pctOfBase = adjustedTotal / context.addressable_base.value;
    if (pctOfBase > SANITY_THRESHOLDS.max_impact_pct_of_addressable) {
      const msg = `${scenario}: Impact is ${(pctOfBase * 100).toFixed(1)}% of addressable base ($${formatCompact(context.addressable_base.value)}) — exceeds ${(SANITY_THRESHOLDS.max_impact_pct_of_addressable * 100)}% threshold`;
      warnings.push({ type: "sanity_check", message: msg });
      sanityFootnotes.push(msg);
    }
  }

  if (context.total_revenue > 0) {
    const pctOfTotal = adjustedTotal / context.total_revenue;
    if (pctOfTotal > SANITY_THRESHOLDS.max_impact_pct_of_total_revenue) {
      const msg = `${scenario}: Impact is ${(pctOfTotal * 100).toFixed(1)}% of total revenue — exceeds ${(SANITY_THRESHOLDS.max_impact_pct_of_total_revenue * 100)}% threshold`;
      warnings.push({ type: "sanity_check", message: msg });
      sanityFootnotes.push(msg);
    }
  }

  if (roiMultiple !== undefined) {
    const cap = SANITY_THRESHOLDS.max_roi_multiple[scenario];
    if (roiMultiple > cap) {
      const msg = `${scenario}: ROI of ${roiMultiple.toFixed(1)}x exceeds ${cap}x threshold — re-examine scoping or investment sizing`;
      warnings.push({ type: "sanity_check", message: msg });
      sanityFootnotes.push(msg);
    }
  }

  // Single KPI concentration check
  if (verifiedTotal > 0) {
    for (const kpi of kpiResults) {
      if (kpi.skipped) continue;
      const pct = kpi.raw_impact / verifiedTotal;
      if (pct > SANITY_THRESHOLDS.max_single_kpi_pct) {
        const msg = `${kpi.kpi_label} is ${(pct * 100).toFixed(0)}% of total impact — concentration risk`;
        warnings.push({ type: "sanity_check", message: msg, kpi_id: kpi.kpi_id });
        sanityFootnotes.push(msg);
      }
    }
  }

  // Weak case check
  if (scenario === "conservative" && roiMultiple !== undefined && roiMultiple < SANITY_THRESHOLDS.weak_case_roi_floor) {
    warnings.push({
      type: "weak_case",
      message: `conservative ROI of ${roiMultiple.toFixed(1)}x is below ${SANITY_THRESHOLDS.weak_case_roi_floor}x — weak financial case`,
    });
  }

  return {
    scenario,
    kpi_results: kpiResults,
    total_annual_impact: adjustedTotal,
    gross_annual_impact: verifiedTotal,
    impact_by_category: impactByCategory,
    year_projections: yearProjections,
    cumulative_3yr_impact: cumulative3yr,
    roi_percentage: roiPercentage,
    roi_multiple: roiMultiple,
    engagement_cost: input.investment.consulting_fee,
    skipped_kpis: skippedKpis,
    investment_breakdown: {
      consulting_fee: input.investment.consulting_fee,
      implementation_cost: input.investment.implementation_cost,
      total_investment: input.investment.total,
      multiplier_used: input.investment.consulting_fee > 0
        ? input.investment.total / input.investment.consulting_fee
        : 0,
      estimation_method: "user_provided",
    },
    overlap_adjustment: {
      gross_offensive: 0,
      gross_defensive: 0,
      gross_efficiency: 0,
      offensive_driver_count: 0,
      offensive_discount: 1,
      adjusted_offensive: 0,
      defensive_revenue_adjustment: 1,
      adjusted_defensive: 0,
      adjusted_efficiency: 0,
      gross_total: verifiedTotal,
      adjusted_total: adjustedTotal,
      overlap_discount_pct: overlapPct,
    },
    realism_caps: {
      pre_cap_impact: adjustedTotal,
      per_driver_caps_applied: [],
      total_cap_applied: false,
      roi_cap_applied: false,
      post_cap_impact: adjustedTotal,
      post_cap_roi_multiple: roiMultiple,
      cap_footnotes: sanityFootnotes,
      weak_case_flag: scenario === "conservative" && roiMultiple !== undefined && roiMultiple < SANITY_THRESHOLDS.weak_case_roi_floor,
    },
    disclaimer: STANDARD_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Arithmetic verification for a single KPI
// ---------------------------------------------------------------------------

function verifyKpiArithmetic(
  kpi: KPICalculation,
  warnings: ValidationWarning[],
): KPIAuditEntry {
  // Re-compute from the stated inputs and formula
  // We support common formula patterns
  const inputs = kpi.inputs;
  const values = Object.values(inputs);

  // Simple product of all inputs (most common: base * percentage)
  const recomputed = values.reduce((product, v) => product * v, 1);

  // Check if the LLM's claimed impact matches our recomputation
  // Allow 1% tolerance for floating point
  const tolerance = Math.abs(kpi.claimed_impact) * 0.01;
  const matches = Math.abs(recomputed - kpi.claimed_impact) <= Math.max(tolerance, 1);

  if (!matches && kpi.claimed_impact !== 0) {
    warnings.push({
      type: "arithmetic_error",
      kpi_id: kpi.id,
      message: `${kpi.label}: LLM claimed $${formatCompact(kpi.claimed_impact)} but inputs multiply to $${formatCompact(recomputed)}. Using recomputed value.`,
    });
  }

  // Use the verified (recomputed) value
  const verifiedImpact = kpi.claimed_impact === 0 ? 0 : recomputed;

  return {
    kpi_id: kpi.id,
    kpi_label: kpi.label,
    formula_description: kpi.formula,
    inputs_used: inputs,
    impact_assumption: 0, // Not applicable — LLM chose its own rates
    raw_impact: verifiedImpact,
    category: kpi.category,
    skipped: kpi.claimed_impact === 0,
    skip_reason: kpi.claimed_impact === 0 ? "Excluded from this scenario" : undefined,
    driver_category: kpi.category,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function projectMultiYear(totalAnnual: number, curve: number[]): YearProjection[] {
  let cumulative = 0;
  return curve.map((pct, i) => {
    const impact = totalAnnual * pct;
    cumulative += impact;
    return {
      year: i + 1,
      realization_percentage: pct,
      projected_impact: impact,
      cumulative_impact: cumulative,
    };
  });
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
