"use client";

import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { formatCurrency } from "../../lib/utils";
import { useCaseStore } from "../../stores/case-store";
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
  investmentBreakdown,
  annualImpact,
  roiMultiple,
  threeYearCumulative,
}: {
  companyName: string;
  serviceType: string;
  investmentBreakdown: ScenarioData["investment_breakdown"] | null;
  annualImpact: string;
  roiMultiple: string | null;
  threeYearCumulative: string;
}) {
  return (
    <div className="relative rounded-xl p-[2px] bg-gradient-to-r from-blue-500 to-purple-500">
      <div className="rounded-[10px] bg-white px-6 py-8 sm:px-8">
        <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed select-text">
          {investmentBreakdown ? (
            <>
              With a total investment of{" "}
              <span className="text-blue-700">
                {formatCurrency(investmentBreakdown.total_investment)}
              </span>{" "}
              in {serviceType},{" "}
            </>
          ) : (
            <>Through {serviceType}, </>
          )}
          <span className="font-bold">{companyName}</span> has potential to unlock{" "}
          <span className="text-blue-700">{annualImpact}</span> in annual
          revenue impact
          {roiMultiple && (
            <>
              {" "}
              &mdash; a{" "}
              <span className="text-purple-700 font-bold">{roiMultiple}</span>{" "}
              return on total investment
            </>
          )}
          .
        </p>
        {investmentBreakdown && (
          <p className="mt-2 text-xs text-gray-400 select-text">
            Investment: {formatCurrency(investmentBreakdown.consulting_fee)} consulting
            {" + "}
            {formatCurrency(investmentBreakdown.implementation_cost)} implementation
            {investmentBreakdown.estimation_method === "auto_estimated" && (
              <span className="italic"> (estimated)</span>
            )}
          </p>
        )}
        <p className="mt-2 text-sm text-gray-500 select-text">
          3-year cumulative value (risk-adjusted):{" "}
          <span className="font-medium text-gray-700">
            {threeYearCumulative}
          </span>
        </p>
      </div>
    </div>
  );
}

function WeakCaseWarning() {
  return (
    <div
      className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800"
      role="alert"
    >
      <span className="font-medium">Low ROI signal:</span> The conservative scenario
      shows a return below 1.5x. This engagement may not produce a strong enough
      financial case. Consider adjusting scope or investment level.
    </div>
  );
}

function OverlapNotice({ data }: { data: ScenarioData }) {
  const overlap = data.overlap_adjustment;
  if (!overlap || overlap.overlap_discount_pct < 0.005) return null;

  return (
    <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
      Impact adjusted for driver overlap: gross{" "}
      <span className="font-medium">{formatCurrency(overlap.gross_total)}</span>
      {" → net "}
      <span className="font-medium">{formatCurrency(overlap.adjusted_total)}</span>
      {" "}
      ({Math.round(overlap.overlap_discount_pct * 100)}% discount for correlated drivers)
    </div>
  );
}

function CapFootnotes({ data }: { data: ScenarioData }) {
  const caps = data.realism_caps;
  if (!caps || caps.cap_footnotes.length === 0) return null;

  return (
    <section className="space-y-2">
      {caps.cap_footnotes.map((note, i) => (
        <ConfidenceNote key={i} message={note} severity="info" />
      ))}
    </section>
  );
}

function DisclaimerSection({ disclaimer }: { disclaimer: string }) {
  return (
    <section className="mt-4">
      <p className="text-xs text-gray-400 leading-relaxed">
        {disclaimer}
      </p>
    </section>
  );
}

function MetricCard({ kpi }: { kpi: KpiResult }) {
  const badgeClass = CATEGORY_BADGE[kpi.category] ?? "bg-gray-50 text-gray-700 border-gray-200";
  const categoryLabel = CATEGORY_LABELS[kpi.category] ?? kpi.category;
  const isCapped = kpi.capped_impact !== undefined && kpi.capped_impact < kpi.raw_impact;
  const displayValue = isCapped ? kpi.capped_impact! : kpi.raw_impact;

  return (
    <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-gray-900">{kpi.kpi_label}</h4>
        <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
          {formatCurrency(displayValue)}
        </p>
        {isCapped && (
          <p className="text-xs text-amber-600 mt-0.5">
            Capped from {formatCurrency(kpi.raw_impact)}
          </p>
        )}
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

function HypothesisBox() {
  const hypothesis = useCaseStore((s) => s.hypothesis);
  if (!hypothesis) return null;

  return (
    <div className="rounded-lg border border-indigo-200 bg-indigo-50 px-6 py-5">
      <h3 className="text-xs font-semibold text-indigo-500 uppercase tracking-wide mb-2">
        Analysis Focus
      </h3>
      <p className="text-base font-medium text-indigo-900">{hypothesis.topic}</p>
      <p className="mt-2 text-sm text-indigo-700 leading-relaxed">{hypothesis.summary}</p>
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
}

function NarrativeSection() {
  const narrative = useCaseStore((s) => s.narrative);
  if (!narrative) return null;
  return (
    <section className="space-y-2">
      <h3 className="text-base font-semibold text-gray-900">
        Analysis Notes
      </h3>
      <div className="rounded-lg border border-gray-200 bg-white p-6">
        <div className="prose prose-sm max-w-none text-gray-700 prose-headings:text-gray-900 prose-strong:text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {narrative}
          </ReactMarkdown>
        </div>
      </div>
    </section>
  );
}

function ResultsViewInner({ result, scenario, serviceType }: Props) {
  const data: ScenarioData = result.scenarios[scenario];

  // Single pass: partition into active vs skipped and collect unique categories
  const activeKpis: KpiResult[] = [];
  const skippedKpis: KpiResult[] = [];
  const categorySet = new Set<string>();

  for (const k of data.kpi_results) {
    if (k.skipped) {
      skippedKpis.push(k);
    } else {
      activeKpis.push(k);
      categorySet.add(k.category);
    }
  }

  activeKpis.sort((a, b) => b.raw_impact - a.raw_impact);

  const categories = [...categorySet];
  const hasInvestment = data.investment_breakdown != null || data.engagement_cost > 0;
  const showWeakCase = data.realism_caps?.weak_case_flag === true;

  return (
    <div className="space-y-8">
      {/* Hypothesis summary */}
      <HypothesisBox />

      {/* Weak case warning */}
      {showWeakCase && <WeakCaseWarning />}

      {/* Hero ROI Statement */}
      <ROIStatement
        companyName={result.company_name}
        serviceType={serviceType}
        investmentBreakdown={hasInvestment ? (data.investment_breakdown ?? null) : null}
        annualImpact={formatCurrency(data.total_annual_impact)}
        roiMultiple={
          hasInvestment && data.roi_multiple
            ? `${data.roi_multiple.toFixed(1)}x`
            : null
        }
        threeYearCumulative={formatCurrency(data.cumulative_3yr_impact)}
      />

      {/* Overlap notice */}
      <OverlapNotice data={data} />

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
          <div
            className="grid gap-4 sm:grid-cols-2"
            style={{ contentVisibility: "auto", containIntrinsicSize: "auto 200px" }}
          >
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
            3-Year Outlook (risk-adjusted)
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

      {/* Realism cap footnotes */}
      <CapFootnotes data={data} />

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

      {/* Calculation Narrative — isolated subscription to avoid re-rendering all KPI cards */}
      <NarrativeSection />

      {/* Disclaimer */}
      {data.disclaimer && <DisclaimerSection disclaimer={data.disclaimer} />}
    </div>
  );
}

export const ResultsView = memo(ResultsViewInner);
