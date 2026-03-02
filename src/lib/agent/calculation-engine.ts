import type {
  CalculationResult, CompanyData, DriverCategory, ImpactAssumptions,
  ImplementationCostEstimate, KPIAuditEntry, KPIConfig,
  MethodologyConfig, OverlapAdjustment, RealismCapResult,
  Scenario, ScenarioResult, YearProjection,
} from "./types";
import { KPI_REGISTRY, INDUSTRY_REFERRAL_DEFAULTS, DEFAULT_REFERRAL_CONVERSION_RATE } from "./kpi-formulas";

// ---------------------------------------------------------------------------
// Public options
// ---------------------------------------------------------------------------

export interface CalculationOptions {
  estimatedImplementationCost?: number;
  serviceType?: string;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SCENARIOS: Scenario[] = ["conservative", "moderate", "aggressive"];

const IMPL_MULTIPLIERS: Record<string, { low: number; mid: number; high: number }> = {
  "experience-transformation-design": { low: 50, mid: 100, high: 150 },
  "cost-optimization":                { low: 20, mid: 40,  high: 60 },
  "digital-ai-transformation":        { low: 80, mid: 140, high: 200 },
  "commercial-excellence":            { low: 30, mid: 55,  high: 80 },
  "org-redesign":                     { low: 40, mid: 70,  high: 100 },
};

const DRIVER_CAP_PCT: Record<Scenario, number> = {
  conservative: 0.03, moderate: 0.05, aggressive: 0.08,
};

const TOTAL_CAP_PCT: Record<Scenario, number> = {
  conservative: 0.05, moderate: 0.08, aggressive: 0.12,
};

const ROI_CAP_CONSERVATIVE = 15;

const STANDARD_DISCLAIMER =
  "This analysis represents estimated potential impact based on available financial data " +
  "and industry benchmarks. Actual results will depend on implementation quality, " +
  "organizational readiness, market conditions, and other factors. Impact estimates include " +
  "overlap adjustments between related drivers and are capped at industry-reasonable levels. " +
  "The implementation cost is estimated based on typical programs of this type and scale; " +
  "actual implementation investment should be scoped separately.";

// ---------------------------------------------------------------------------
// Main entry point
// ---------------------------------------------------------------------------

export function calculate(
  companyData: CompanyData,
  methodology: MethodologyConfig,
  impactAssumptions: ImpactAssumptions,
  options?: CalculationOptions,
): CalculationResult {
  const enabledKpis: KPIConfig[] = [];
  const requiredInputs = new Set<string>();
  for (const k of methodology.kpis) {
    if (!k.enabled) continue;
    enabledKpis.push(k);
    for (const input of k.inputs) requiredInputs.add(input);
  }
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
    scenarios[scenario] = runScenario(
      companyData, methodology, enabledKpis, scenario, impactAssumptions, options,
    );
  }

  const weakCaseFlag = scenarios.conservative.realism_caps?.weak_case_flag ?? false;

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
    weak_case_flag: weakCaseFlag || undefined,
  };
}

// ---------------------------------------------------------------------------
// Scenario runner — with overlap, caps, and implementation cost
// ---------------------------------------------------------------------------

function runScenario(
  companyData: CompanyData, config: MethodologyConfig,
  enabledKpis: KPIConfig[], scenario: Scenario,
  impactAssumptions: ImpactAssumptions,
  options?: CalculationOptions,
): ScenarioResult {
  // 1. Calculate all KPIs independently
  const kpiResults: KPIAuditEntry[] = [];
  const skippedKpis: string[] = [];
  const impactByCategory: Record<string, number> = {};
  let grossTotal = 0;

  for (const kpiConfig of enabledKpis) {
    const entry = calculateSingleKpi(companyData, kpiConfig, impactAssumptions, scenario);
    // 2. Tag with driver_category from KPI_REGISTRY
    const kpiDef = KPI_REGISTRY[kpiConfig.id];
    if (kpiDef) entry.driver_category = kpiDef.driverCategory;
    kpiResults.push(entry);
    if (entry.skipped) {
      skippedKpis.push(entry.kpi_id);
    } else {
      grossTotal += entry.raw_impact;
      impactByCategory[entry.category] = (impactByCategory[entry.category] ?? 0) + entry.raw_impact;
    }
  }

  // 3. Get annual revenue for caps (fallback to grossTotal if unavailable)
  const annualRevenue = companyData.fields.annual_revenue?.value;

  // 4. Apply overlap adjustment
  const overlap = applyOverlapAdjustment(kpiResults, annualRevenue);

  // 5. Calculate implementation cost → total_investment
  const engCost = companyData.fields.engagement_cost;
  const engCostVal = engCost?.value ?? 0;
  const investmentBreakdown = engCostVal > 0
    ? calculateImplementationCost(
        engCostVal,
        options?.serviceType,
        annualRevenue,
        options?.estimatedImplementationCost,
      )
    : undefined;

  const totalInvestment = investmentBreakdown?.total_investment ?? engCostVal;

  // 6. ROI based on total investment (not just consulting fee)
  let roiPct: number | undefined;
  let roiMult: number | undefined;
  if (totalInvestment > 0) {
    roiPct = ((overlap.adjusted_total - totalInvestment) / totalInvestment) * 100;
    roiMult = overlap.adjusted_total / totalInvestment;
  }

  // 7. Apply realism caps
  const caps = applyRealismCaps(
    overlap.adjusted_total, kpiResults, scenario, annualRevenue, roiMult,
  );

  // Recalculate ROI after caps if cap was applied
  if (totalInvestment > 0 && caps.post_cap_impact !== overlap.adjusted_total) {
    roiPct = ((caps.post_cap_impact - totalInvestment) / totalInvestment) * 100;
    roiMult = caps.post_cap_roi_multiple;
  }

  // 8. Multi-year projection uses postCapImpact
  const yearProjections = projectMultiYear(caps.post_cap_impact, config.realization_curve);
  const cumulative = yearProjections.reduce((s, p) => s + p.projected_impact, 0);

  return {
    scenario,
    kpi_results: kpiResults,
    total_annual_impact: caps.post_cap_impact,
    gross_annual_impact: grossTotal,
    impact_by_category: impactByCategory,
    year_projections: yearProjections,
    cumulative_3yr_impact: cumulative,
    roi_percentage: roiPct,
    roi_multiple: roiMult,
    engagement_cost: engCostVal || undefined,
    skipped_kpis: skippedKpis,
    investment_breakdown: investmentBreakdown,
    overlap_adjustment: overlap,
    realism_caps: caps,
    disclaimer: STANDARD_DISCLAIMER,
  };
}

// ---------------------------------------------------------------------------
// Implementation cost estimation (Fix 1)
// ---------------------------------------------------------------------------

function calculateImplementationCost(
  engagementCost: number,
  serviceType?: string,
  annualRevenue?: number,
  userProvided?: number,
): ImplementationCostEstimate {
  if (userProvided && userProvided > 0) {
    return {
      consulting_fee: engagementCost,
      implementation_cost: userProvided,
      total_investment: engagementCost + userProvided,
      multiplier_used: userProvided / engagementCost,
      estimation_method: "user_provided",
    };
  }

  const tiers = IMPL_MULTIPLIERS[serviceType ?? ""] ?? IMPL_MULTIPLIERS["experience-transformation-design"];

  // Scale multiplier by company revenue tier
  let multiplier: number;
  if (!annualRevenue || annualRevenue < 1_000_000_000) {
    multiplier = tiers.low;
  } else if (annualRevenue < 10_000_000_000) {
    multiplier = tiers.mid;
  } else {
    multiplier = tiers.high;
  }

  // Implementation cost = consulting_fee × multiplier (as a percentage)
  // e.g. $500K consulting × 100 means the company spends $50M total to implement
  // This is the "total change program" cost — not just consulting
  const implCost = engagementCost * multiplier;

  return {
    consulting_fee: engagementCost,
    implementation_cost: implCost,
    total_investment: engagementCost + implCost,
    multiplier_used: multiplier,
    estimation_method: "auto_estimated",
  };
}

// ---------------------------------------------------------------------------
// Overlap adjustment (Fix 2)
// ---------------------------------------------------------------------------

function applyOverlapAdjustment(
  kpiResults: KPIAuditEntry[],
  _annualRevenue?: number,
): OverlapAdjustment {
  let grossOffensive = 0;
  let grossDefensive = 0;
  let grossEfficiency = 0;
  let offensiveCount = 0;

  for (const kpi of kpiResults) {
    if (kpi.skipped) continue;
    const cat = kpi.driver_category as DriverCategory | undefined;
    if (cat === "offensive") {
      grossOffensive += kpi.raw_impact;
      offensiveCount++;
    } else if (cat === "defensive") {
      grossDefensive += kpi.raw_impact;
    } else if (cat === "efficiency") {
      grossEfficiency += kpi.raw_impact;
    }
  }

  // Offensive discount: 1 driver = 1.0, 2 = 0.85, 3+ = 0.75
  const offensiveDiscount = offensiveCount <= 1 ? 1.0 : offensiveCount === 2 ? 0.85 : 0.75;
  const adjustedOffensive = grossOffensive * offensiveDiscount;

  // Defensive: discount by overlap with offensive revenue uplift
  const grossTotal = grossOffensive + grossDefensive + grossEfficiency;
  const offensivePctOfTotal = grossTotal > 0 ? grossOffensive / grossTotal : 0;
  const defensiveRevAdj = Math.max(0.8, 1.0 - offensivePctOfTotal * 0.2);
  const adjustedDefensive = grossDefensive * defensiveRevAdj;

  // Efficiency: no adjustment
  const adjustedEfficiency = grossEfficiency;

  const adjustedTotal = adjustedOffensive + adjustedDefensive + adjustedEfficiency;
  const overlapPct = grossTotal > 0 ? 1 - adjustedTotal / grossTotal : 0;

  return {
    gross_offensive: grossOffensive,
    gross_defensive: grossDefensive,
    gross_efficiency: grossEfficiency,
    offensive_driver_count: offensiveCount,
    offensive_discount: offensiveDiscount,
    adjusted_offensive: adjustedOffensive,
    defensive_revenue_adjustment: defensiveRevAdj,
    adjusted_defensive: adjustedDefensive,
    adjusted_efficiency: adjustedEfficiency,
    gross_total: grossTotal,
    adjusted_total: adjustedTotal,
    overlap_discount_pct: overlapPct,
  };
}

// ---------------------------------------------------------------------------
// Realism caps (Fix 3)
// ---------------------------------------------------------------------------

function applyRealismCaps(
  adjustedTotal: number,
  kpiResults: KPIAuditEntry[],
  scenario: Scenario,
  annualRevenue?: number,
  roiMultiple?: number,
): RealismCapResult {
  const footnotes: string[] = [];
  const capsApplied: string[] = [];
  let postCapImpact = adjustedTotal;
  let totalCapApplied = false;
  let roiCapApplied = false;
  let postCapRoi = roiMultiple;
  let weakCaseFlag = false;

  // Per-driver caps (only if we have annual revenue)
  if (annualRevenue && annualRevenue > 0) {
    const driverCapPct = DRIVER_CAP_PCT[scenario];
    const driverCap = annualRevenue * driverCapPct;

    for (const kpi of kpiResults) {
      if (kpi.skipped) continue;
      if (kpi.raw_impact > driverCap) {
        kpi.capped_impact = driverCap;
        capsApplied.push(kpi.kpi_id);
        footnotes.push(
          `${kpi.kpi_label} capped at ${(driverCapPct * 100).toFixed(0)}% of revenue ` +
          `($${formatCompact(driverCap)} from $${formatCompact(kpi.raw_impact)})`,
        );
      }
    }

    // Recalculate total if any drivers were capped
    if (capsApplied.length > 0) {
      postCapImpact = 0;
      for (const kpi of kpiResults) {
        if (kpi.skipped) continue;
        postCapImpact += kpi.capped_impact ?? kpi.raw_impact;
      }
    }

    // Total cap
    const totalCap = annualRevenue * TOTAL_CAP_PCT[scenario];
    if (postCapImpact > totalCap) {
      totalCapApplied = true;
      footnotes.push(
        `Total impact capped at ${(TOTAL_CAP_PCT[scenario] * 100).toFixed(0)}% of revenue ` +
        `($${formatCompact(totalCap)} from $${formatCompact(postCapImpact)})`,
      );
      postCapImpact = totalCap;
    }
  }

  // ROI cap at conservative
  if (scenario === "conservative" && postCapRoi !== undefined && postCapRoi > ROI_CAP_CONSERVATIVE) {
    roiCapApplied = true;
    footnotes.push(`ROI capped at ${ROI_CAP_CONSERVATIVE}x for conservative scenario`);
    // Back-calculate capped impact from max ROI
    // We don't know total_investment here, but we can cap the multiple
    postCapRoi = ROI_CAP_CONSERVATIVE;
  }

  // Weak case floor: ROI < 1.5x at conservative
  if (scenario === "conservative" && postCapRoi !== undefined && postCapRoi < 1.5) {
    weakCaseFlag = true;
    footnotes.push(
      "Conservative ROI below 1.5x — this engagement may not produce " +
      "a strong enough financial case. Consider adjusting scope or investment.",
    );
  }

  return {
    pre_cap_impact: adjustedTotal,
    per_driver_caps_applied: capsApplied,
    total_cap_applied: totalCapApplied,
    roi_cap_applied: roiCapApplied,
    post_cap_impact: postCapImpact,
    post_cap_roi_multiple: postCapRoi,
    cap_footnotes: footnotes,
    weak_case_flag: weakCaseFlag,
  };
}

// ---------------------------------------------------------------------------
// Single KPI calculation
// ---------------------------------------------------------------------------

function calculateSingleKpi(
  companyData: CompanyData, kpiConfig: KPIConfig,
  impactAssumptions: ImpactAssumptions, scenario: Scenario,
): KPIAuditEntry {
  const kpiDef = KPI_REGISTRY[kpiConfig.id];
  if (!kpiDef) return skippedEntry(kpiConfig, `KPI '${kpiConfig.id}' not found in registry`);

  const impactValue = impactAssumptions[kpiConfig.id]?.[scenario];
  if (impactValue === undefined) return skippedEntry(kpiConfig, "No impact assumption provided");

  const inputsUsed: Record<string, number> = {};
  const missingFields: string[] = [];

  for (const fieldName of kpiDef.requiredInputs) {
    const dp = companyData.fields[fieldName];
    if (!dp) { missingFields.push(fieldName); continue; }
    inputsUsed[fieldName] = dp.value;
  }

  if (missingFields.length > 0) return skippedEntry(kpiConfig, `Missing required inputs: ${missingFields.join(", ")}`);

  const formulaInputs = { ...inputsUsed, [kpiDef.benchmarkInput]: impactValue };

  // Inject referral defaults for NPS referral revenue
  if (kpiConfig.id === "nps_referral_revenue") {
    if (formulaInputs.referral_rate === undefined) {
      formulaInputs.referral_rate =
        INDUSTRY_REFERRAL_DEFAULTS[companyData.industry] ?? 0.12;
    }
    if (formulaInputs.referral_conversion_rate === undefined) {
      formulaInputs.referral_conversion_rate = DEFAULT_REFERRAL_CONVERSION_RATE;
    }
  }

  let rawImpact: number;
  try {
    rawImpact = kpiDef.formula(formulaInputs);
  } catch (e) {
    return skippedEntry(kpiConfig, `Formula error: ${e}`);
  }

  return {
    kpi_id: kpiConfig.id,
    kpi_label: kpiConfig.label || kpiDef.label,
    formula_description: kpiConfig.formula,
    inputs_used: inputsUsed,
    impact_assumption: impactValue,
    raw_impact: rawImpact,
    category: kpiDef.category,
    skipped: false,
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
    return { year: i + 1, realization_percentage: pct, projected_impact: impact, cumulative_impact: cumulative };
  });
}

function skippedEntry(kpiConfig: KPIConfig, reason: string): KPIAuditEntry {
  return {
    kpi_id: kpiConfig.id,
    kpi_label: kpiConfig.label || kpiConfig.id,
    formula_description: kpiConfig.formula,
    inputs_used: {},
    impact_assumption: 0,
    raw_impact: 0,
    category: "unknown",
    skipped: true,
    skip_reason: reason,
  };
}

function formatCompact(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(0)}K`;
  return n.toFixed(0);
}
