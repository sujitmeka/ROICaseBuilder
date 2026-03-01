import { tool } from "ai";
import { z } from "zod";
import { supabase } from "../supabase";
import { calculate } from "./calculation-engine";
import type { CompanyData, MethodologyConfig } from "./types";

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
  if (!Array.isArray(data.kpis) || !data.confidence_discounts) return null;
  return data as MethodologyConfig;
}

// ---------------------------------------------------------------------------
// AI SDK tools (Zod inputSchema + inline execute)
// ---------------------------------------------------------------------------

export const tools = {
  load_methodology: tool({
    description:
      "Load the active methodology config for a given service type from Supabase. Returns the full methodology JSON including KPI definitions, benchmark ranges, confidence discounts, and realization curve.",
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
      "Run the full ROI calculation engine using company data and the active methodology. Loads the methodology from Supabase, then calculates conservative/moderate/aggressive scenarios with full audit trail.",
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
    }),
    execute: async ({ company_data, service_type }) => {
      const methodology = await loadActiveMethodology(service_type);
      if (!methodology) {
        return { error: `No active methodology found for service_type="${service_type}"` };
      }

      const companyData: CompanyData = {
        company_name: company_data.company_name,
        industry: company_data.industry,
        fields: company_data.fields,
      };

      const result = calculate(companyData, methodology);
      return result;
    },
  }),
};
