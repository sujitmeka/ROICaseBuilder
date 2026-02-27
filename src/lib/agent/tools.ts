import { tool } from "ai";
import { z } from "zod";
import { supabase } from "../supabase";
import { calculate } from "./calculation-engine";
import type { CompanyData, DataPointInput, MethodologyConfig } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const FETCH_TIMEOUT_MS = 30_000;

/**
 * Parse a numeric value from text. Uses `hint` to disambiguate when the text
 * contains both percentages and currency amounts (common in financial prose).
 */
function parseNumeric(raw: unknown, hint?: "currency" | "percentage"): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  const lower = s.toLowerCase();
  if (!s || lower === "n/a" || lower === "na" || lower === "not available" || lower === "none" || lower === "null") {
    return null;
  }

  const pctMatch = s.match(/(-?\d+\.?\d*)\s*%/);
  if (pctMatch && hint !== "currency") {
    return parseFloat(pctMatch[1]) / 100;
  }

  const multipliers: Record<string, number> = {
    trillion: 1_000_000_000_000,
    billion: 1_000_000_000,
    million: 1_000_000,
    thousand: 1_000,
  };
  const moneyMatch = s.match(/\$?\s*(-?\d[\d,]*\.?\d*)\s*(trillion|billion|million|thousand)/i);
  if (moneyMatch) {
    const value = parseFloat(moneyMatch[1].replace(/,/g, ""));
    return isNaN(value) ? null : value * multipliers[moneyMatch[2].toLowerCase()];
  }

  const plainMatch = s.match(/(-?\$?\d[\d,]*\.?\d*)/);
  if (plainMatch) {
    const cleaned = plainMatch[1].replace(/[$,]/g, "");
    const num = parseFloat(cleaned);
    return isNaN(num) ? null : num;
  }

  return null;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

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
// Valyu query config
// ---------------------------------------------------------------------------

const VALYU_QUERIES: Record<string, { queryFn: (c: string) => string; hint: "currency" | "percentage" }> = {
  annual_revenue:     { queryFn: (c) => `What is ${c}'s total annual revenue from their latest SEC filing?`, hint: "currency" },
  net_income:         { queryFn: (c) => `What is ${c}'s net income from their latest SEC filing?`, hint: "currency" },
  gross_margin:       { queryFn: (c) => `What is ${c}'s gross margin percentage?`, hint: "percentage" },
  operating_margin:   { queryFn: (c) => `What is ${c}'s operating margin percentage?`, hint: "percentage" },
  revenue_growth_yoy: { queryFn: (c) => `What is ${c}'s year-over-year revenue growth rate?`, hint: "percentage" },
  online_revenue:     { queryFn: (c) => `What is ${c}'s online or digital revenue?`, hint: "currency" },
};

async function queryValyu(query: string, apiKey: string): Promise<string | null> {
  const res = await fetch("https://api.valyu.network/v1/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      query,
      search_type: "all",
      max_num_results: 5,
    }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });

  if (!res.ok) return null;

  const json = await res.json();
  const results = json?.results ?? json?.data ?? [];
  if (Array.isArray(results) && results.length > 0) {
    return results[0]?.content ?? results[0]?.text ?? JSON.stringify(results[0]);
  }
  return JSON.stringify(json);
}

// ---------------------------------------------------------------------------
// Crunchbase extraction shape
// ---------------------------------------------------------------------------

interface CrunchbaseExtraction {
  company_name?: string;
  total_funding?: string;
  estimated_revenue?: string;
  employee_count?: string;
  headquarters?: string;
  founded_date?: string;
  estimated_valuation?: string;
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

  fetch_financials: tool({
    description:
      "Fetch financial data for a public company from SEC filings via Valyu API. Queries revenue, income, margins, and growth rate in parallel. Returns a CompanyData object with confidence-scored fields.",
    inputSchema: z.object({
      company_name: z.string().describe("The company name to look up, e.g. 'Nike'"),
      industry: z.string().describe("The industry vertical, e.g. 'Retail/Apparel'"),
    }),
    execute: async ({ company_name, industry }) => {
      const apiKey = process.env.VALYU_API_KEY;
      if (!apiKey) return { error: "VALYU_API_KEY is not set" };

      const fieldNames = Object.keys(VALYU_QUERIES);
      const entries = fieldNames.map((f) => VALYU_QUERIES[f]);
      const queryTexts = entries.map((e) => e.queryFn(company_name));

      const settled = await Promise.allSettled(
        queryTexts.map((q) => queryValyu(q, apiKey))
      );

      const fields: Record<string, DataPointInput> = {};
      for (let i = 0; i < fieldNames.length; i++) {
        const result = settled[i];
        const rawValue = result.status === "fulfilled" ? result.value : null;
        const parsed = parseNumeric(rawValue, entries[i].hint);
        if (parsed !== null) {
          fields[fieldNames[i]] = {
            value: parsed,
            confidence_tier: "company_reported",
            confidence_score: 0.9,
          };
        }
      }

      const companyData: CompanyData = {
        company_name,
        industry,
        fields,
      };
      return companyData;
    },
  }),

  scrape_company: tool({
    description:
      "Scrape company data from Crunchbase via Firecrawl for private/pre-IPO companies. Extracts funding, estimated revenue, headcount, and valuation. Returns a CompanyData object with estimated confidence scores.",
    inputSchema: z.object({
      company_name: z.string().describe("The company name to look up on Crunchbase"),
      industry: z.string().describe("The industry vertical, e.g. 'DTC Retail'"),
    }),
    execute: async ({ company_name, industry }) => {
      const apiKey = process.env.FIRECRAWL_API_KEY;
      if (!apiKey) return { error: "FIRECRAWL_API_KEY is not set" };

      const slug = slugify(company_name);
      const url = `https://www.crunchbase.com/organization/${slug}`;

      const res = await fetch("https://api.firecrawl.dev/v1/scrape", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          url,
          formats: ["extract"],
          extract: {
            prompt: `Extract all available company information for '${company_name}' from this Crunchbase page.`,
            schema: {
              type: "object",
              properties: {
                company_name: { type: "string" },
                total_funding: { type: "string" },
                estimated_revenue: { type: "string" },
                employee_count: { type: "string" },
                headquarters: { type: "string" },
                founded_date: { type: "string" },
                estimated_valuation: { type: "string" },
              },
            },
          },
        }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      });

      if (!res.ok) {
        const errText = await res.text();
        return {
          error: `Firecrawl request failed (${res.status})`,
          details: errText.slice(0, 500),
        };
      }

      const json = await res.json();
      const extracted: CrunchbaseExtraction =
        json?.data?.extract ?? json?.extract ?? {};

      const fields: Record<string, DataPointInput> = {};
      const mapping: Array<{ key: string; raw: unknown }> = [
        { key: "total_funding", raw: extracted.total_funding },
        { key: "estimated_revenue", raw: extracted.estimated_revenue },
        { key: "annual_revenue", raw: extracted.estimated_revenue },
        { key: "employee_count", raw: extracted.employee_count },
        { key: "estimated_valuation", raw: extracted.estimated_valuation },
      ];

      for (const { key, raw } of mapping) {
        const parsed = parseNumeric(raw, "currency");
        if (parsed !== null) {
          fields[key] = {
            value: parsed,
            confidence_tier: "estimated",
            confidence_score: 0.5,
          };
        }
      }

      const companyData: CompanyData = {
        company_name: extracted.company_name ?? company_name,
        industry,
        fields,
      };
      return companyData;
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
