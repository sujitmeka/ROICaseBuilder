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
  revenue: "bg-[#1a1a1a] text-[#a8a8a8] border-[#2a2a2a]",
  retention: "bg-[#1a1a1a] text-[#a8a8a8] border-[#2a2a2a]",
  cost_savings: "bg-[#1a1a1a] text-[#a8a8a8] border-[#2a2a2a]",
  engagement: "bg-[#1a1a1a] text-[#a8a8a8] border-[#2a2a2a]",
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
    <div className="relative rounded-xl border border-[#2a2a2a]">
      <div className="rounded-[10px] bg-[#111111] px-6 py-8 sm:px-8">
        <p className="text-xl sm:text-2xl font-semibold text-white leading-relaxed select-text">
          {investmentBreakdown ? (
            <>
              With a total investment of{" "}
              <span className="font-bold text-white">
                {formatCurrency(investmentBreakdown.total_investment)}
              </span>{" "}
              in {serviceType},{" "}
            </>
          ) : (
            <>Through {serviceType}, </>
          )}
          <span className="font-bold">{companyName}</span> has potential to unlock{" "}
          <span className="font-bold text-white">{annualImpact}</span> in annual
          revenue impact
          {roiMultiple && (
            <>
              {" "}
              &mdash; a{" "}
              <span className="font-bold text-white">{roiMultiple}</span>{" "}
              return on total investment
            </>
          )}
          .
        </p>
        {investmentBreakdown && (
          <p className="mt-2 text-xs text-[#707070] select-text">
            Investment: {formatCurrency(investmentBreakdown.consulting_fee)} consulting
            {" + "}
            {formatCurrency(investmentBreakdown.implementation_cost)} implementation
            {investmentBreakdown.estimation_method === "auto_estimated" && (
              <span className="italic"> (estimated)</span>
            )}
          </p>
        )}
        <p className="mt-2 text-sm text-[#a8a8a8] select-text">
          3-year cumulative value (risk-adjusted):{" "}
          <span className="font-medium text-white">
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
      className="rounded-md border border-[#2a2a2a] bg-[#111111] px-4 py-3 text-sm text-amber-400"
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
    <div className="rounded-md border border-[#2a2a2a] bg-[#111111] px-4 py-3 text-sm text-[#a8a8a8]">
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
      <p className="text-xs text-[#707070] leading-relaxed">
        {disclaimer}
      </p>
    </section>
  );
}

function MetricCard({ kpi }: { kpi: KpiResult }) {
  const badgeClass = CATEGORY_BADGE[kpi.category] ?? "bg-[#1a1a1a] text-[#a8a8a8] border-[#2a2a2a]";
  const categoryLabel = CATEGORY_LABELS[kpi.category] ?? kpi.category;
  const isCapped = kpi.capped_impact !== undefined && kpi.capped_impact < kpi.raw_impact;
  const displayValue = isCapped ? kpi.capped_impact! : kpi.raw_impact;

  return (
    <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-5">
      <div className="mb-3">
        <h4 className="text-sm font-semibold text-white">{kpi.kpi_label}</h4>
        <p className="text-2xl font-bold text-white mt-1 tabular-nums">
          {formatCurrency(displayValue)}
        </p>
        {isCapped && (
          <p className="text-xs text-amber-400 mt-0.5">
            Capped from {formatCurrency(kpi.raw_impact)}
          </p>
        )}
      </div>

      <p className="text-xs text-[#a8a8a8] mb-3">{kpi.formula_description}</p>

      <div className="flex items-center gap-3 pt-3 border-t border-[#2a2a2a]">
        <span
          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badgeClass}`}
        >
          {categoryLabel}
        </span>

        <span className="ml-auto text-xs font-medium text-[#707070] tabular-nums">
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
        projection.year % 2 === 0 ? "bg-[#111111]" : "bg-black"
      }`}
    >
      <span className="w-20 text-sm font-medium text-white">
        Year {projection.year}
      </span>
      <span className="flex-1 text-sm tabular-nums text-white">
        {formatCurrency(projection.projected_impact)}
      </span>
      <span className="flex-1 text-sm tabular-nums text-white">
        {formatCurrency(projection.cumulative_impact)}
      </span>
      <span className="w-24 text-right text-sm tabular-nums text-[#707070]">
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
      ? "bg-[#111111] border-l-amber-500 text-amber-400"
      : "bg-[#111111] border-l-[#a8a8a8] text-[#a8a8a8]";

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
    <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] px-6 py-5">
      <h3 className="text-xs font-semibold text-[#707070] uppercase tracking-wide mb-2">
        Analysis Focus
      </h3>
      <p className="text-base font-medium text-white">{hypothesis.topic}</p>
      <p className="mt-2 text-sm text-[#a8a8a8] leading-relaxed">{hypothesis.summary}</p>
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
      <h3 className="text-base font-semibold text-white">
        Analysis Notes
      </h3>
      <div className="rounded-lg border border-[#2a2a2a] bg-[#111111] p-6">
        <div className="prose prose-sm prose-invert max-w-none text-[#a8a8a8] prose-headings:text-white prose-strong:text-white">
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
        <h3 className="text-base font-semibold text-white">
          Executive Summary
        </h3>
        <p className="text-sm text-[#a8a8a8] leading-relaxed">
          Based on {result.industry} benchmarks and {result.company_name}
          &apos;s financial data, this analysis identifies{" "}
          <span className="font-medium text-white">{activeKpis.length} high-impact opportunities</span>{" "}
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
          <h3 className="text-base font-semibold text-white mb-4">
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
          <h3 className="text-base font-semibold text-white mb-4">
            3-Year Outlook (risk-adjusted)
          </h3>
          <div className="rounded-lg border border-[#2a2a2a] bg-black overflow-hidden">
            <div className="flex items-center gap-4 py-2 px-4 bg-[#111111] text-xs font-medium text-[#707070] uppercase tracking-wide">
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
          <h3 className="text-sm font-medium text-[#707070] mb-3">
            Skipped Metrics
          </h3>
          <div className="space-y-2">
            {skippedKpis.map((kpi) => (
              <div
                key={kpi.kpi_id}
                className="rounded-lg border border-[#2a2a2a] bg-[#0a0a0a] px-5 py-4"
              >
                <p className="text-sm text-[#707070] line-through">
                  {kpi.kpi_label}
                </p>
                {kpi.skip_reason && (
                  <p className="mt-1 text-xs italic text-[#707070]">
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
