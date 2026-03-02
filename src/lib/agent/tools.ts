import { tool } from "ai";
import { z } from "zod";
import { supabase } from "../supabase";
import { calculate } from "./calculation-engine";
import type { CompanyData, ImpactAssumptions, MethodologyConfig } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export async function loadActiveMethodology(serviceType: string): Promise<MethodologyConfig | null> {
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
  return data as MethodologyConfig;
}

// ---------------------------------------------------------------------------
// AI SDK tools (Zod inputSchema + inline execute)
// ---------------------------------------------------------------------------

export const tools = {
  load_methodology: tool({
    description:
      "Load the active methodology research guide. Returns KPI definitions with typical ranges, reasoning guidance, and realization curve.",
    inputSchema: z.object({
      service_type: z
        .string()
        .describe("The service type to load methodology for, e.g. 'Experience Transformation & Design'"),
    }),
    execute: async ({ service_type }) => {
      const methodology = await loadActiveMethodology(service_type);
      if (!methodology) {
        return { error: `No active methodology found for service_type="${service_type}"` };
      }
      return methodology;
    },
  }),

  run_calculation: tool({
    description:
      "Run the ROI calculation engine with company data and agent-determined impact assumptions. Loads the methodology, then calculates conservative/moderate/aggressive scenarios.",
    inputSchema: z.object({
      company_data: z
        .object({
          company_name: z.string().describe("Company name"),
          industry: z.string().describe("Industry vertical"),
          fields: z
            .record(
              z.string(),
              z.object({
                value: z.number().describe("The numeric value"),
                confidence_tier: z.enum([
                  "company_reported",
                  "industry_benchmark",
                  "cross_industry",
                  "estimated",
                ]),
                confidence_score: z.number().describe("Confidence score 0-1"),
              })
            )
            .describe(
              "Data fields keyed by field name. Each value has {value, confidence_tier, confidence_score}"
            ),
        })
        .describe("The company data with financial fields to use in calculations"),
      service_type: z.string().describe("The service type to load methodology for"),
      impact_assumptions: z
        .record(
          z.string(),
          z.object({
            conservative: z.number(),
            moderate: z.number(),
            aggressive: z.number(),
          })
        )
        .describe("Agent-determined impact percentages per KPI per scenario. Keys are KPI IDs."),
    }),
    execute: async ({ company_data, service_type, impact_assumptions }) => {
      const methodology = await loadActiveMethodology(service_type);
      if (!methodology) {
        return { error: `No active methodology found for service_type="${service_type}"` };
      }

      const companyData: CompanyData = {
        company_name: company_data.company_name,
        industry: company_data.industry,
        fields: company_data.fields,
      };

      const result = calculate(companyData, methodology, impact_assumptions as ImpactAssumptions);
      return result;
    },
  }),
};
