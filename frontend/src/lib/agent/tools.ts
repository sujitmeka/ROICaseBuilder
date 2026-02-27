import { z } from "zod/v4";
import { tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import { supabase } from "../supabase";
import { calculate } from "./calculation-engine";
import type { CompanyData, DataPointInput, MethodologyConfig } from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Parse numeric strings returned by Valyu into raw numbers.
 *
 * Handles:
 *   "$51.2 billion"  -> 51_200_000_000
 *   "$340.5 million" -> 340_500_000
 *   "45.3%"          -> 0.453
 *   "-5.2%"          -> -0.052
 *   "N/A"            -> null
 *   "$1,234,567"     -> 1234567
 *   "1234.56"        -> 1234.56
 */
function parseNumeric(raw: unknown): number | null {
  if (raw === null || raw === undefined) return null;
  const s = String(raw).trim();
  if (!s || s.toLowerCase() === "n/a" || s.toLowerCase() === "not available") {
    return null;
  }

  // Percentage handling
  if (s.includes("%")) {
    const num = parseFloat(s.replace(/[^0-9.\-]/g, ""));
    return isNaN(num) ? null : num / 100;
  }

  // Multiplier keywords
  const lower = s.toLowerCase();
  let multiplier = 1;
  if (lower.includes("trillion")) multiplier = 1_000_000_000_000;
  else if (lower.includes("billion")) multiplier = 1_000_000_000;
  else if (lower.includes("million")) multiplier = 1_000_000;
  else if (lower.includes("thousand")) multiplier = 1_000;

  // Strip everything except digits, dots, and minus signs
  const cleaned = s.replace(/[^0-9.\-]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num * multiplier;
}

/**
 * Parse money strings from Firecrawl / Crunchbase extractions.
 * Similar to parseNumeric but tuned for funding / valuation strings.
 */
function _parse_money(raw: unknown): number | null {
  return parseNumeric(raw);
}

/**
 * Generate a URL-safe slug from a company name.
 * "Warby Parker" -> "warby-parker"
 */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// ---------------------------------------------------------------------------
// Tool 1: load_methodology
// ---------------------------------------------------------------------------

const loadMethodologyTool = tool(
  "load_methodology",
  "Load the active methodology config for a given service type from Supabase. Returns the full methodology JSON including KPI definitions, benchmark ranges, confidence discounts, and realization curve.",
  {
    service_type: z.string().describe("The service type to load methodology for, e.g. 'Experience Transformation & Design'"),
  },
  async (args) => {
    const { data, error } = await supabase
      .from("methodologies")
      .select("*")
      .eq("service_type", args.service_type)
      .eq("enabled", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error || !data) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `No active methodology found for service_type="${args.service_type}"`,
              details: error?.message ?? "No rows returned",
            }),
          },
        ],
      };
    }

    return {
      content: [{ type: "text" as const, text: JSON.stringify(data) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 2: fetch_financials
// ---------------------------------------------------------------------------

const VALYU_QUERIES: Record<string, (company: string) => string> = {
  annual_revenue: (c) => `What is ${c}'s total annual revenue from their latest SEC filing?`,
  net_income: (c) => `What is ${c}'s net income from their latest SEC filing?`,
  gross_margin: (c) => `What is ${c}'s gross margin percentage?`,
  operating_margin: (c) => `What is ${c}'s operating margin percentage?`,
  revenue_growth_yoy: (c) => `What is ${c}'s year-over-year revenue growth rate?`,
  online_revenue: (c) => `What is ${c}'s online or digital revenue?`,
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
  });

  if (!res.ok) return null;

  const json = await res.json();
  // Valyu returns results[].content — take the first result's content
  const results = json?.results ?? json?.data ?? [];
  if (Array.isArray(results) && results.length > 0) {
    return results[0]?.content ?? results[0]?.text ?? JSON.stringify(results[0]);
  }
  return JSON.stringify(json);
}

const fetchFinancialsTool = tool(
  "fetch_financials",
  "Fetch financial data for a public company from SEC filings via Valyu API. Queries revenue, income, margins, and growth rate in parallel. Returns a CompanyData object with confidence-scored fields.",
  {
    company_name: z.string().describe("The company name to look up, e.g. 'Nike'"),
    industry: z.string().describe("The industry vertical, e.g. 'Retail/Apparel'"),
  },
  async (args) => {
    const apiKey = process.env.VALYU_API_KEY;
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "VALYU_API_KEY is not set" }),
          },
        ],
      };
    }

    const fieldNames = Object.keys(VALYU_QUERIES);
    const queryTexts = fieldNames.map((f) =>
      VALYU_QUERIES[f](args.company_name)
    );

    // Fire all queries in parallel with resilience
    const settled = await Promise.allSettled(
      queryTexts.map((q) => queryValyu(q, apiKey))
    );

    const fields: Record<string, DataPointInput> = {};
    for (let i = 0; i < fieldNames.length; i++) {
      const result = settled[i];
      const rawValue =
        result.status === "fulfilled" ? result.value : null;
      const parsed = parseNumeric(rawValue);
      if (parsed !== null) {
        fields[fieldNames[i]] = {
          value: parsed,
          confidence_tier: "company_reported",
          confidence_score: 0.9,
        };
      }
    }

    const companyData: CompanyData = {
      company_name: args.company_name,
      industry: args.industry,
      fields,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(companyData) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 3: scrape_company
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

const scrapeCompanyTool = tool(
  "scrape_company",
  "Scrape company data from Crunchbase via Firecrawl for private/pre-IPO companies. Extracts funding, estimated revenue, headcount, and valuation. Returns a CompanyData object with estimated confidence scores.",
  {
    company_name: z.string().describe("The company name to look up on Crunchbase"),
    industry: z.string().describe("The industry vertical, e.g. 'DTC Retail'"),
  },
  async (args) => {
    const apiKey = process.env.FIRECRAWL_API_KEY;
    if (!apiKey) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({ error: "FIRECRAWL_API_KEY is not set" }),
          },
        ],
      };
    }

    const slug = slugify(args.company_name);
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
          prompt: `Extract all available company information for '${args.company_name}' from this Crunchbase page.`,
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
    });

    if (!res.ok) {
      const errText = await res.text();
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `Firecrawl request failed (${res.status})`,
              details: errText,
            }),
          },
        ],
      };
    }

    const json = await res.json();
    const extracted: CrunchbaseExtraction =
      json?.data?.extract ?? json?.extract ?? {};

    // Map extracted fields to CompanyData
    const fields: Record<string, DataPointInput> = {};

    const mapping: Array<{ key: string; raw: unknown }> = [
      { key: "total_funding", raw: extracted.total_funding },
      { key: "estimated_revenue", raw: extracted.estimated_revenue },
      { key: "annual_revenue", raw: extracted.estimated_revenue },
      { key: "employee_count", raw: extracted.employee_count },
      { key: "estimated_valuation", raw: extracted.estimated_valuation },
    ];

    for (const { key, raw } of mapping) {
      const parsed = _parse_money(raw);
      if (parsed !== null) {
        fields[key] = {
          value: parsed,
          confidence_tier: "estimated",
          confidence_score: 0.5,
        };
      }
    }

    const companyData: CompanyData = {
      company_name: extracted.company_name ?? args.company_name,
      industry: args.industry,
      fields,
    };

    return {
      content: [{ type: "text" as const, text: JSON.stringify(companyData) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Tool 4: run_calculation
// ---------------------------------------------------------------------------

const runCalculationTool = tool(
  "run_calculation",
  "Run the full ROI calculation engine using company data and the active methodology. Loads the methodology from Supabase, then calculates conservative/moderate/aggressive scenarios with full audit trail.",
  {
    company_data: z.object({
      company_name: z.string().describe("Company name"),
      industry: z.string().describe("Industry vertical"),
      fields: z.record(
        z.string(),
        z.object({
          value: z.number().describe("The numeric value of the data point"),
          confidence_tier: z
            .enum(["company_reported", "industry_benchmark", "cross_industry", "estimated"])
            .describe("Data source tier"),
          confidence_score: z
            .number()
            .describe("Confidence score between 0 and 1"),
        })
      ).describe("Data fields keyed by field name"),
    }).describe("The company data with financial fields to use in calculations"),
    service_type: z
      .string()
      .describe("The service type to load methodology for"),
  },
  async (args) => {
    // Load methodology from Supabase
    const { data: methodologyRow, error } = await supabase
      .from("methodologies")
      .select("*")
      .eq("service_type", args.service_type)
      .eq("enabled", true)
      .order("version", { ascending: false })
      .limit(1)
      .single();

    if (error || !methodologyRow) {
      return {
        content: [
          {
            type: "text" as const,
            text: JSON.stringify({
              error: `No active methodology found for service_type="${args.service_type}"`,
              details: error?.message ?? "No rows returned",
            }),
          },
        ],
      };
    }

    const methodology = methodologyRow as MethodologyConfig;

    const companyData: CompanyData = {
      company_name: args.company_data.company_name,
      industry: args.company_data.industry,
      fields: args.company_data.fields,
    };

    const result = calculate(companyData, methodology);

    return {
      content: [{ type: "text" as const, text: JSON.stringify(result) }],
    };
  }
);

// ---------------------------------------------------------------------------
// Exported server factory
// ---------------------------------------------------------------------------

export function createCproiToolServer() {
  return createSdkMcpServer({
    name: "cproi-tools",
    version: "1.0.0",
    tools: [
      loadMethodologyTool,
      fetchFinancialsTool,
      scrapeCompanyTool,
      runCalculationTool,
    ],
  });
}
