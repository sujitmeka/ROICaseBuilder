"use client";

import { memo } from "react";

// ---------------------------------------------------------------------------
// Table wrapper
// ---------------------------------------------------------------------------

function Table({
  headers,
  rows,
}: {
  headers: string[];
  rows: string[][];
}) {
  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="bg-gray-50 border-b border-gray-200">
            {headers.map((h, i) => (
              <th
                key={i}
                className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wide"
              >
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row, i) => (
            <tr key={i} className={i % 2 === 0 ? "bg-white" : "bg-gray-50/50"}>
              {row.map((cell, j) => (
                <td
                  key={j}
                  className={`px-4 py-3 text-gray-700 ${j === 0 ? "font-medium text-gray-900" : ""}`}
                >
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 className="text-base font-semibold text-gray-900 mt-8 mb-3 first:mt-0">
      {title}
    </h3>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function BackboneViewInner() {
  return (
    <div className="space-y-2">
      <p className="text-sm text-gray-500 leading-relaxed mb-6">
        The framework that powers every ROI analysis. The LLM follows this process
        end-to-end, with the calculation engine acting as a pure arithmetic validator.
      </p>

      {/* Overall Architecture */}
      <SectionHeader title="Overall Architecture" />
      <Table
        headers={["Layer", "Role", "Key Principle"]}
        rows={[
          [
            "LLM (Opus 4.6)",
            "Does ALL reasoning \u2014 scoping, assumptions, formulas, calculations",
            "\u201CScope first, calculate second\u201D",
          ],
          [
            "Calculation Engine",
            "Pure arithmetic validator \u2014 re-checks math, runs sanity checks, produces audit trail",
            "Does NOT apply attribution factors, look up formulas, or load configs",
          ],
          [
            "Skills",
            "Service-specific reasoning guidance loaded at runtime",
            "Universal framework + per-service skills",
          ],
        ]}
      />

      {/* 8-Step Process */}
      <SectionHeader title="The 8-Step Process" />
      <Table
        headers={["Step", "Name", "What Happens"]}
        rows={[
          [
            "1",
            "Understand the Engagement",
            "Load methodology + service skill. Identify what the service actually changes, which tier, which industry",
          ],
          [
            "2",
            "Source Company Data",
            "Pull financials (Valyu/Firecrawl). Record source, confidence, recency for every data point. Get segment/channel breakdowns",
          ],
          [
            "3",
            "Scope the Addressable Base",
            "The critical step. Narrow to the specific journey/channel the engagement touches (e.g., $46B \u2192 $13B digital \u2192 $5.2B mobile checkout)",
          ],
          [
            "4",
            "Estimate Improvement",
            "Apply improvement % to the SCOPED base only. Differentiate scenarios by scope, not just percentages. Conservative = top 2 drivers only",
          ],
          [
            "5",
            "Document Assumptions",
            "Output structured JSON: addressable_base, scoping_logic, key_assumptions, overlap_note, investment_sizing",
          ],
          [
            "6",
            "Size the Full Investment",
            "Consulting fee + implementation (engineering, platform, QA, change mgmt). Reason from company reality, not a multiplier",
          ],
          [
            "7",
            "Calculate & Validate",
            "LLM does math first, then calls validate_calculation tool. Engine re-checks arithmetic, projects YoY via realization curve",
          ],
          [
            "8",
            "Sanity Check",
            "Automated thresholds. If failed \u2192 go back to Step 3, don\u2019t just cap",
          ],
        ]}
      />

      {/* Scoping by Engagement Tier */}
      <SectionHeader title="Scoping by Engagement Tier" />
      <Table
        headers={["Tier", "Cost", "Scope", "Addressable Base"]}
        rows={[
          ["CORE", "$150\u2013200K", "1 priority journey", "Revenue through that ONE journey"],
          ["EXPANDED", "$275\u2013350K", "2\u20133 priority journeys", "Combined revenue through those journeys"],
          ["ENTERPRISE", "$400\u2013500K+", "Full customer lifecycle / multi-BU", "Broader base, still not total revenue"],
        ]}
      />

      {/* Scenario Differentiation */}
      <SectionHeader title="Scenario Differentiation" />
      <Table
        headers={["Scenario", "Driver Selection", "Benchmark Position", "Key Rule"]}
        rows={[
          [
            "Conservative",
            "Top 2 highest-confidence only",
            "Lower end of typical range",
            "Exclude KPIs where >50% inputs are estimated",
          ],
          [
            "Moderate",
            "All medium+ confidence drivers",
            "Midpoint of range",
            "Benchmarks OK for up to 2 inputs",
          ],
          [
            "Aggressive",
            "ALL drivers + 1 upside driver",
            "Upper end of range",
            "Includes plausible-but-less-certain KPIs",
          ],
        ]}
      />

      {/* Sanity Check Thresholds */}
      <SectionHeader title="Sanity Check Thresholds (Validator)" />
      <Table
        headers={["Check", "Threshold", "Action if Exceeded"]}
        rows={[
          [
            "Impact % of addressable base",
            "< 15%",
            "Re-examine improvement assumptions",
          ],
          [
            "Impact % of total revenue",
            "< 5%",
            "Something wrong with scoping",
          ],
          [
            "ROI multiple (3yr)",
            "Conservative <10x, Moderate <20x, Aggressive <35x",
            "Re-examine scoping or investment sizing",
          ],
          [
            "Single KPI concentration",
            "No KPI > 60% of total",
            "Over-reliance = fragile case",
          ],
          [
            "Conservative ROI floor",
            "> 1.5x",
            "Below = weak financial case",
          ],
        ]}
      />

      {/* Skill Architecture */}
      <SectionHeader title="Skill Architecture" />
      <Table
        headers={["Skill", "Scope", "When Loaded"]}
        rows={[
          [
            "roi-financial-modeling",
            "Universal 8-step framework, sanity checks, common mistakes",
            "Always in system prompt",
          ],
          [
            "experience-transformation",
            "ET-specific: sector lenses, journey scoping, enterprise indicators, maturity signals",
            "Loaded via load_skill after Step 1",
          ],
          [
            "Future: org-redesign, new-product-dev, etc.",
            "Service-specific reasoning",
            "Same pattern",
          ],
        ]}
      />
    </div>
  );
}

export const BackboneView = memo(BackboneViewInner);
