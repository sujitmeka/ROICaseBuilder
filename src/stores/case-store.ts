import { create } from "zustand";

export type Scenario = "conservative" | "moderate" | "aggressive";

export interface AuditEntry {
  id: string;
  kpiId: string;
  label: string;
  value: number;
  formattedValue: string;
  source: string;
  sourceUrl?: string;
  sourceDate?: string;
  confidenceLevel: "high" | "medium" | "low";
  dataClass: "company" | "benchmark" | "estimated" | "override";
  formula?: string;
  inputs?: Record<string, number>;
  citationIndex?: number;
  narrativeSectionId?: string;
}

export interface KpiResult {
  kpi_id: string;
  kpi_label: string;
  formula_description: string;
  inputs_used: Record<string, number>;
  impact_assumption: number;
  raw_impact: number;
  category: string;
  skipped: boolean;
  skip_reason: string | null;
  driver_category?: string;
  capped_impact?: number;
}

export interface YearProjection {
  year: number;
  realization_percentage: number;
  projected_impact: number;
  cumulative_impact: number;
}

export interface ScenarioData {
  scenario: string;
  total_annual_impact: number;
  impact_by_category: Record<string, number>;
  year_projections: YearProjection[];
  cumulative_3yr_impact: number;
  roi_percentage: number;
  roi_multiple: number;
  engagement_cost: number;
  kpi_results: KpiResult[];
  skipped_kpis: string[];
  investment_breakdown?: {
    consulting_fee: number;
    implementation_cost: number;
    total_investment: number;
    multiplier_used: number;
    estimation_method: "user_provided" | "auto_estimated";
  };
  overlap_adjustment?: {
    gross_total: number;
    adjusted_total: number;
    overlap_discount_pct: number;
  };
  realism_caps?: {
    pre_cap_impact: number;
    post_cap_impact: number;
    cap_footnotes: string[];
    weak_case_flag: boolean;
  };
  gross_annual_impact?: number;
  disclaimer?: string;
}

export interface CalculationResult {
  company_name: string;
  industry: string;
  methodology_id: string;
  methodology_version: string;
  scenarios: Record<Scenario, ScenarioData>;
  data_completeness: number;
  missing_inputs: string[];
  available_inputs: string[];
  warnings: string[];
  weak_case_flag?: boolean;
}

interface CaseStore {
  caseId: string | null;
  companyName: string;
  industry: string;
  serviceType: string;
  calculationResult: CalculationResult | null;
  narrative: string;
  activeScenario: Scenario;
  auditEntries: AuditEntry[];
  setCaseInfo: (info: {
    caseId: string;
    companyName: string;
    industry: string;
    serviceType: string;
  }) => void;
  setResult: (result: CalculationResult) => void;
  setNarrative: (text: string) => void;
  setActiveScenario: (scenario: Scenario) => void;
  setAuditEntries: (entries: AuditEntry[]) => void;
  reset: () => void;
}

export const useCaseStore = create<CaseStore>((set) => ({
  caseId: null,
  companyName: "",
  industry: "",
  serviceType: "",
  calculationResult: null,
  narrative: "",
  activeScenario: "moderate",
  auditEntries: [],

  setCaseInfo: (info) => set(info),
  setResult: (result) => set({ calculationResult: result }),
  setNarrative: (text) => set({ narrative: text }),
  setActiveScenario: (scenario) => set({ activeScenario: scenario }),
  setAuditEntries: (entries) => set({ auditEntries: entries }),
  reset: () =>
    set({
      caseId: null,
      companyName: "",
      industry: "",
      serviceType: "",
      calculationResult: null,
      narrative: "",
      activeScenario: "moderate",
      auditEntries: [],
    }),
}));
