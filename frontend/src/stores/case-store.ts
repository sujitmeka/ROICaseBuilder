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
  raw_impact: number;
  adjusted_impact: number;
  weighted_impact: number;
  weight: number;
  confidence_discount: number;
  category: string;
  skipped: boolean;
  skip_reason: string | null;
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
  total_annual_impact_unweighted: number;
  impact_by_category: Record<string, number>;
  year_projections: YearProjection[];
  cumulative_3yr_impact: number;
  roi_percentage: number;
  roi_multiple: number;
  engagement_cost: number;
  kpi_results: KpiResult[];
  skipped_kpis: string[];
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
  appendNarrative: (chunk: string) => void;
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
  appendNarrative: (chunk) =>
    set((state) => ({ narrative: state.narrative + chunk })),
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
