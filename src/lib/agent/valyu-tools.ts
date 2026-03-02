/**
 * Custom Valyu financial data tools with guardrails:
 * - Restricted to 6 financial datasets (no crypto, forex, BLS, etc.)
 * - Automatic date range (last 6 months → today)
 * - Agent can override dates if needed
 *
 * Replaces @valyu/ai-sdk's financeSearch + secSearch which are too broad
 * and don't support date filtering.
 */

import { tool } from "ai";
import { z } from "zod";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const VALYU_API_URL = "https://api.valyu.ai/v1/search";

/** Only the datasets CPROI needs — no crypto, forex, insider transactions, etc. */
const FINANCIAL_SOURCES = [
  "valyu/valyu-sec-filings",
  "valyu/valyu-earnings-US",
  "valyu/valyu-balance-sheet-US",
  "valyu/valyu-income-statement-US",
  "valyu/valyu-cash-flow-US",
  "valyu/valyu-statistics-US",
] as const;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** YYYY-MM-DD string for today */
function today(): string {
  return new Date().toISOString().split("T")[0];
}

/** YYYY-MM-DD string for 6 months ago */
function sixMonthsAgo(): string {
  const d = new Date();
  d.setMonth(d.getMonth() - 6);
  return d.toISOString().split("T")[0];
}

// ---------------------------------------------------------------------------
// Tool
// ---------------------------------------------------------------------------

export function financialData(config: { apiKey?: string; maxNumResults?: number } = {}) {
  const apiKey = config.apiKey ?? process.env.VALYU_API_KEY;
  const defaultMaxResults = config.maxNumResults ?? 5;

  return tool({
    description:
      "Search US public company financial data: SEC filings (10-K, 10-Q, 8-K), " +
      "earnings reports, balance sheets, income statements, cash flow statements, " +
      "and financial statistics. Date range defaults to the last 6 months but can " +
      "be overridden. Use specific queries like 'Nike 10-K annual revenue 2025'.",
    inputSchema: z.object({
      query: z
        .string()
        .min(1)
        .max(500)
        .describe(
          "Natural language query. Be specific: include company name, filing type, " +
          "and metric. E.g. 'Apple 10-K annual revenue and net income FY2025'"
        ),
      start_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "Start date filter (YYYY-MM-DD). Defaults to 6 months ago. " +
          "Override to search further back, e.g. '2023-01-01' for older filings."
        ),
      end_date: z
        .string()
        .regex(/^\d{4}-\d{2}-\d{2}$/)
        .optional()
        .describe(
          "End date filter (YYYY-MM-DD). Defaults to today."
        ),
      max_num_results: z
        .number()
        .int()
        .min(1)
        .max(10)
        .optional()
        .describe("Max results to return (1-10). Default: 5."),
    }),
    execute: async ({ query, start_date, end_date, max_num_results }) => {
      if (!apiKey) {
        throw new Error(
          "VALYU_API_KEY is required. Set it in environment variables or pass it in config."
        );
      }

      const response = await fetch(VALYU_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
        },
        body: JSON.stringify({
          query,
          search_type: "proprietary",
          max_num_results: max_num_results ?? defaultMaxResults,
          included_sources: [...FINANCIAL_SOURCES],
          start_date: start_date ?? sixMonthsAgo(),
          end_date: end_date ?? today(),
          response_length: "medium",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Valyu API error: ${response.status} - ${errorText}`);
      }

      return response.json();
    },
  });
}
