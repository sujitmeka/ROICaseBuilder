import { tool } from "ai";
import { z } from "zod";
import { supabase } from "../supabase";
import { validate } from "./calculation-engine";
import type { MethodologyConfig } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

let cachedMethodology: { key: string; value: MethodologyConfig; cachedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

export async function loadActiveMethodology(serviceType: string): Promise<MethodologyConfig | null> {
  if (
    cachedMethodology?.key === serviceType &&
    Date.now() - cachedMethodology.cachedAt < CACHE_TTL_MS
  ) {
    return cachedMethodology.value;
  }

  const { data, error } = await supabase
    .from("methodologies")
    .select("*")
    .eq("service_type", serviceType)
    .eq("enabled", true)
    .order("version", { ascending: false })
    .limit(1)
    .single();

  if (error || !data) return null;
  if (!Array.isArray(data.kpis)) return null;
  cachedMethodology = { key: serviceType, value: data as MethodologyConfig, cachedAt: Date.now() };
  return cachedMethodology.value;
}

// ---------------------------------------------------------------------------
// KPI calculation schema (what the LLM passes per KPI)
// ---------------------------------------------------------------------------

const kpiCalculationSchema = z.object({
  id: z.string().describe("KPI identifier"),
  label: z.string().describe("Human-readable KPI name"),
  category: z.enum(["offensive", "defensive", "efficiency"])
    .describe("Driver category: offensive (revenue), defensive (retention), efficiency (cost)"),
  inputs: z.record(z.string(), z.number())
    .describe("Named inputs used in the formula (e.g. { addressable_revenue: 5200000000, lift_pct: 0.06 })"),
  formula: z.string()
    .describe("Human-readable formula description (e.g. 'addressable_revenue * lift_pct')"),
  claimed_impact: z.number()
    .describe("The dollar impact YOU calculated. Set to 0 for KPIs excluded from this scenario."),
});

const scenarioCalculationSchema = z.object({
  kpis: z.array(kpiCalculationSchema)
    .describe("All KPIs with their calculations for this scenario"),
  overlap_adjustment_pct: z.number().min(0).max(1).optional()
    .describe("Overlap discount as a decimal (e.g. 0.15 = 15% discount). Apply when multiple offensive KPIs share the same underlying improvement."),
  investment: z.object({
    consulting_fee: z.number().describe("The engagement/consulting fee"),
    implementation_cost: z.number().describe("Estimated implementation cost beyond consulting"),
    total: z.number().describe("consulting_fee + implementation_cost"),
  }),
});

// ---------------------------------------------------------------------------
// AI SDK tools
// ---------------------------------------------------------------------------

export const tools = {
  load_methodology: tool({
    description:
      "Load the active methodology research guide. Returns KPI definitions with typical ranges, reasoning guidance, and realization curve.",
    inputSchema: z.object({
      service_type: z
        .string()
        .describe("The service type to load methodology for, e.g. 'experience-transformation-design'"),
    }),
    execute: async ({ service_type }) => {
      const methodology = await loadActiveMethodology(service_type);
      if (!methodology) {
        return { error: `No active methodology found for service_type="${service_type}"` };
      }
      return methodology;
    },
  }),

  validate_calculation: tool({
    description:
      "Validate your ROI calculations. Pass your calculated KPI impacts, investment sizing, and " +
      "addressable base. The validator re-checks arithmetic, produces a structured audit trail, " +
      "runs sanity checks, and generates year-over-year projections. Call this AFTER you've " +
      "done your own calculations in Steps 3-7 of the framework.",
    inputSchema: z.object({
      company_name: z.string(),
      industry: z.string(),
      addressable_base: z.object({
        value: z.number().describe("The scoped addressable revenue/cost base in dollars"),
        label: z.string().describe("What this base represents (e.g. 'Mobile checkout revenue')"),
      }),
      total_revenue: z.number().describe("Total company revenue (for sanity checks only)"),
      realization_curve: z.array(z.number())
        .describe("Year-over-year realization percentages, e.g. [0.4, 0.7, 0.9] for 3 years"),
      scenarios: z.object({
        conservative: scenarioCalculationSchema,
        moderate: scenarioCalculationSchema,
        aggressive: scenarioCalculationSchema,
      }),
    }),
    execute: async (input) => {
      return validate(input);
    },
  }),
};
