"use client";

import { formatCurrency } from "../../lib/utils";
import type {
  CalculationResult,
  ScenarioData,
  KpiResult,
  YearProjection,
  Scenario,
} from "../../stores/case-store";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CATEGORY_LABELS: Record<string, string> = {
  revenue: "Revenue & Conversion",
  retention: "Retention & Loyalty",
  cost_savings: "Efficiency & Cost",
  engagement: "Engagement",
};

const CATEGORY_BADGE: Record<string, string> = {
  revenue: "bg-blue-50 text-blue-700 border-blue-200",
  retention: "bg-purple-50 text-purple-700 border-purple-200",
  cost_savings: "bg-emerald-50 text-emerald-700 border-emerald-200",
  engagement: "bg-amber-50 text-amber-700 border-amber-200",
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ROIStatement({
  companyName,
  serviceType,
  investment,
  annualImpact,
  roiMultiple,
  threeYearCumulative,
}: {
  companyName: string;
  serviceType: string;
  investment: string | null;
  annualImpact: string;
  roiMultiple: string | null;
  threeYearCumulative: string;
}) {
  return (
    <div className="relative rounded-xl p-[2px] bg-gradient-to-r from-blue-500 to-purple-500">
      <div className="rounded-[10px] bg-white px-6 py-8 sm:px-8">
        <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed select-text">
          {investment ? (
            <>
              By investing{" "}
              <span className="text-blue-700">{investment}</span> in{" "}
              {serviceType},{" "}
            </>
          ) : (
            <>Through {serviceType}, </>
          )}
          <span className="font-bold">{companyName}</span> could realize{" "}
          <span className="text-blue-700">{annualImpact}</span> in annual
          revenue impact
          {roiMultiple && (
            <>
              {" "}
              &mdash; a{" "}
              <span className="text-purple-700 font-bold">{roiMultiple}</span>{" "}
              return
            </>
          )}
          .
        </p>
        <p className="mt-4 text-sm text-gray-500 select-text">
          3-year cumulative impact:{" "}
          <span className="font-medium text-gray-700">
            {threeYearCumulative}
          </span>
        </p>
      </div>
    </div>
  );
}

function MetricCard({ kpi }: { kpi: KpiResult }) {
  const badgeClass = CATEGORY_BADGE[kpi.category] ?? "bg-gray-50 text-gray-700 border-gray-200";
  const categoryLabel = CATEGORY_LABELS[kpi.category] ?? kpi.category;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{kpi.kpi_label}</h4>
        <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
          {formatCurrency(kpi.raw_impact)}
        </p>
      </div>

      <p className="text-xs text-gray-500 mb-3">{kpi.formula_description}</p>

      <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {categoryLabel}
        </span>

        <span className="ml-auto text-xs font-medium text-gray-400 tabular-nums">
          {Math.round(kpi.impact_assumption * 100)}% est. impact
        </span>
      </div>
    </div>
  );
}

function ProjectionRow({ projection }: { projection: YearProjection }) {
  return (
    <div
      className={`flex items-center gap-4 py-3 px-4 ${
        projection.year % 2 === 0 ? "bg-gray-50" : "bg-white"
      }`}
    >
      <span className="w-20 text-sm font-medium text-gray-900">
        Year {projection.year}
      </span>
      <span className="flex-1 text-sm tabular-nums text-gray-700">
        {formatCurrency(projection.projected_impact)}
      </span>
      <span className="flex-1 text-sm tabular-nums text-gray-700">
        {formatCurrency(projection.cumulative_impact)}
      </span>
      <span className="w-24 text-right text-sm tabular-nums text-gray-500">
        {Math.round(projection.realization_percentage * 100)}%
      </span>
    </div>
  );
}

function ConfidenceNote({
  message,
  severity,
}: {
  message: string;
  severity: "info" | "warning";
}) {
  const styles =
    severity === "warning"
      ? "bg-amber-50 border-l-amber-500 text-amber-800"
      : "bg-blue-50 border-l-blue-500 text-blue-800";

  return (
    <div
      className={`rounded-r-md border-l-4 px-4 py-3 text-sm ${styles}`}
      role="note"
    >
      {message}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main ResultsView
// ---------------------------------------------------------------------------

interface Props {
  result: CalculationResult;
  scenario: Scenario;
  serviceType: string;
  narrative: string;
}

export function ResultsView({ result, scenario, serviceType, narrative }: Props) {
  const data: ScenarioData = result.scenarios[scenario];

  const activeKpis = data.kpi_results
    .filter((k) => !k.skipped)
    .sort((a, b) => b.raw_impact - a.raw_impact);

  const skippedKpis = data.kpi_results.filter((k) => k.skipped);

  const hasInvestment = data.engagement_cost > 0;
  const categories = [...new Set(activeKpis.map((k) => k.category))];

  return (
    <div className="space-y-8">
      {/* Hero ROI Statement */}
      <ROIStatement
        companyName={result.company_name}
        serviceType={serviceType}
        investment={hasInvestment ? formatCurrency(data.engagement_cost) : null}
        annualImpact={formatCurrency(data.total_annual_impact)}
        roiMultiple={
          hasInvestment && data.roi_multiple
            ? `${data.roi_multiple.toFixed(1)}x`
            : null
        }
        threeYearCumulative={formatCurrency(data.cumulative_3yr_impact)}
      />

      {/* Executive Summary — generated from data */}
      <section className="space-y-2">
        <h3 className="text-base font-semibold text-gray-900">
          Executive Summary
        </h3>
        <p className="text-sm text-gray-700 leading-relaxed">
          Based on {result.industry} benchmarks and {result.company_name}
          &apos;s financial data, this analysis identifies{" "}
          <span className="font-medium">{activeKpis.length} high-impact opportunities</span>{" "}
          across {categories.map((c) => CATEGORY_LABELS[c] ?? c).join(", ")}.
          {result.data_completeness < 1 && (
            <>
              {" "}
              Data completeness is{" "}
              {Math.round(result.data_completeness * 100)}% — benchmark
              estimates were used where company-specific data was unavailable.
            </>
          )}
        </p>
      </section>

      {/* KPI Impact Cards */}
      {activeKpis.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            Impact Breakdown
          </h3>
          <div className="grid gap-4 sm:grid-cols-2">
            {activeKpis.map((kpi) => (
              <MetricCard key={kpi.kpi_id} kpi={kpi} />
            ))}
          </div>
        </section>
      )}

      {/* 3-Year Projections */}
      {data.year_projections.length > 0 && (
        <section>
          <h3 className="text-base font-semibold text-gray-900 mb-4">
            3-Year Outlook
          </h3>
          <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
            <div className="flex items-center gap-4 py-2 px-4 bg-gray-50 text-xs font-medium text-gray-500 uppercase tracking-wide">
              <span className="w-20">Year</span>
              <span className="flex-1">Annual Impact</span>
              <span className="flex-1">Cumulative</span>
              <span className="w-24 text-right">Realization</span>
            </div>
            {data.year_projections.map((proj) => (
              <ProjectionRow key={proj.year} projection={proj} />
            ))}
          </div>
        </section>
      )}

      {/* Warnings */}
      {result.warnings.length > 0 && (
        <section className="space-y-2">
          {result.warnings.map((warning, i) => (
            <ConfidenceNote key={i} message={warning} severity="warning" />
          ))}
        </section>
      )}

      {/* Skipped KPIs */}
      {skippedKpis.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-gray-500 mb-3">
            Skipped Metrics
          </h3>
          <div className="space-y-2">
            {skippedKpis.map((kpi) => (
              <div
                key={kpi.kpi_id}
                className="rounded-lg border border-gray-100 bg-gray-50 px-5 py-4"
              >
                <p className="text-sm text-gray-400 line-through">
                  {kpi.kpi_label}
                </p>
                {kpi.skip_reason && (
                  <p className="mt-1 text-xs italic text-gray-400">
                    {kpi.skip_reason}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Calculation Narrative */}
      {narrative && (
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-gray-900">
            Analysis Notes
          </h3>
          <div className="rounded-lg border border-gray-200 bg-white p-6">
            <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
              {narrative}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
