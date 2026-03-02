import type {
  CalculationResult, CompanyData, ImpactAssumptions,
  KPIAuditEntry, KPIConfig, MethodologyConfig, Scenario,
  ScenarioResult, YearProjection,
} from "./types";
import { KPI_REGISTRY } from "./kpi-formulas";

const SCENARIOS: Scenario[] = ["conservative", "moderate", "aggressive"];

export function calculate(
  companyData: CompanyData,
  methodology: MethodologyConfig,
  impactAssumptions: ImpactAssumptions,
): CalculationResult {
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
    scenarios[scenario] = runScenario(companyData, methodology, enabledKpis, scenario, impactAssumptions);
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
  impactAssumptions: ImpactAssumptions,
): ScenarioResult {
  const kpiResults: KPIAuditEntry[] = [];
  const skippedKpis: string[] = [];

  for (const kpiConfig of enabledKpis) {
    const entry = calculateSingleKpi(companyData, kpiConfig, impactAssumptions, scenario);
    kpiResults.push(entry);
    if (entry.skipped) skippedKpis.push(entry.kpi_id);
  }

  const totalImpact = kpiResults.filter((e) => !e.skipped).reduce((s, e) => s + e.raw_impact, 0);

  const impactByCategory: Record<string, number> = {};
  for (const entry of kpiResults) {
    if (!entry.skipped) {
      impactByCategory[entry.category] = (impactByCategory[entry.category] ?? 0) + entry.raw_impact;
    }
  }

  const yearProjections = projectMultiYear(totalImpact, config.realization_curve);
  const cumulative = yearProjections.reduce((s, p) => s + p.projected_impact, 0);

  const engCost = companyData.fields.engagement_cost;
  let roiPct: number | undefined;
  let roiMult: number | undefined;
  let engCostVal: number | undefined;

  if (engCost && engCost.value > 0) {
    engCostVal = engCost.value;
    roiPct = ((totalImpact - engCostVal) / engCostVal) * 100;
    roiMult = totalImpact / engCostVal;
  }

  return {
    scenario,
    kpi_results: kpiResults,
    total_annual_impact: totalImpact,
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
