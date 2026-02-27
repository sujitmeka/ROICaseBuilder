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

export interface ScenarioData {
  totalImpact: number;
  roi: number;
  revenueAtRisk: number;
}

export interface CalculationResult {
  scenarios: Record<Scenario, ScenarioData>;
  breakdown: {
    kpiId: string;
    label: string;
    conservative: number;
    moderate: number;
    aggressive: number;
  }[];
  realization: { year1: number; year2: number; year3: number };
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
}));
