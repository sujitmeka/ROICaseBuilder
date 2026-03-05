// === Enums as union types ===
export type Scenario = "conservative" | "moderate" | "aggressive";
export type DataSourceTier = "company_reported" | "industry_benchmark" | "cross_industry" | "estimated";
export type DriverCategory = "offensive" | "defensive" | "efficiency";

// === Service Tier ===
export interface ServiceTier {
  name: string;
  price_range: { low: number; high: number };
  attribution_range: { low: number; high: number };
}

// === Impact assumption types ===
export interface TypicalRange {
  low: number;
  high: number;
}

export interface ScenarioImpact {
  conservative: number;
  moderate: number;
  aggressive: number;
}

export type ImpactAssumptions = Record<string, ScenarioImpact>;

// === Methodology types (match Supabase schema) ===
export interface KPIConfig {
  id: string;
  label: string;
  formula: string;
  inputs: string[];
  enabled: boolean;
  typical_range: TypicalRange;
  reasoning_guidance: string;
  reference_sources: string[];
}

export interface MethodologyConfig {
  id: string;
  name: string;
  version: string;
  description: string;
  applicable_industries: string[];
  service_type: string;
  kpis: KPIConfig[];
  realization_curve: number[];
  value_creation_framework?: Record<string, unknown>;
  sector_lens?: Record<string, unknown>;
  service_tiers?: Record<string, unknown>;
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

// === Implementation Cost ===
export interface ImplementationCostEstimate {
  consulting_fee: number;
  implementation_cost: number;
  total_investment: number;
  multiplier_used: number;
  estimation_method: "user_provided" | "auto_estimated";
}

// === Overlap Adjustment ===
export interface OverlapAdjustment {
  gross_offensive: number;
  gross_defensive: number;
  gross_efficiency: number;
  offensive_driver_count: number;
  offensive_discount: number;
  adjusted_offensive: number;
  defensive_revenue_adjustment: number;
  adjusted_defensive: number;
  adjusted_efficiency: number;
  gross_total: number;
  adjusted_total: number;
  overlap_discount_pct: number;
}

// === Realism Caps ===
export interface RealismCapResult {
  pre_cap_impact: number;
  per_driver_caps_applied: string[];
  total_cap_applied: boolean;
  roi_cap_applied: boolean;
  post_cap_impact: number;
  post_cap_roi_multiple: number | undefined;
  cap_footnotes: string[];
  weak_case_flag: boolean;
}

// === Calculation Results ===
export interface KPIAuditEntry {
  kpi_id: string;
  kpi_label: string;
  formula_description: string;
  inputs_used: Record<string, number>;
  impact_assumption: number;
  raw_impact: number;
  category: string;
  skipped: boolean;
  skip_reason?: string;
  driver_category?: DriverCategory;
  capped_impact?: number;
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
  impact_by_category: Record<string, number>;
  year_projections: YearProjection[];
  cumulative_3yr_impact: number;
  roi_percentage?: number;
  roi_multiple?: number;
  engagement_cost?: number;
  attribution_factor?: number;
  pre_attribution_impact?: number;
  skipped_kpis: string[];
  investment_breakdown?: ImplementationCostEstimate;
  overlap_adjustment?: OverlapAdjustment;
  realism_caps?: RealismCapResult;
  gross_annual_impact?: number;
  disclaimer?: string;
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
  weak_case_flag?: boolean;
}
