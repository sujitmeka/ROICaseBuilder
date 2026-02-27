// === Enums as union types ===
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
  company_reported: number;
  industry_benchmark: number;
  cross_industry: number;
  estimated: number;
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
