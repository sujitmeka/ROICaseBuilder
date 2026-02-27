import { defineRegistry } from "@json-render/react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { catalog } from "./catalog";

const confidenceDot: Record<string, string> = {
  high: "bg-green-500",
  medium: "bg-yellow-500",
  low: "bg-red-500",
};

const confidenceLabel: Record<string, string> = {
  high: "High confidence",
  medium: "Medium confidence",
  low: "Low confidence",
};

const dataClassBadge: Record<string, { label: string; className: string }> = {
  company: {
    label: "Company Data",
    className: "bg-blue-50 text-blue-700 border-blue-200",
  },
  benchmark: {
    label: "Benchmark",
    className: "bg-purple-50 text-purple-700 border-purple-200",
  },
  estimated: {
    label: "Estimated",
    className: "bg-amber-50 text-amber-700 border-amber-200",
  },
};

export const { registry } = defineRegistry(catalog, {
  components: {
    ROIStatement: ({ props }) => {
      const {
        companyName,
        serviceType,
        investment,
        annualImpact,
        roiMultiple,
        threeYearCumulative,
      } = props;

      return (
        <div className="relative rounded-xl p-[2px] bg-gradient-to-r from-blue-500 to-purple-500">
          <div className="rounded-[10px] bg-white px-6 py-8 sm:px-8">
            <p className="text-xl sm:text-2xl font-semibold text-gray-900 leading-relaxed select-text">
              By investing{" "}
              <span className="text-blue-700">{investment}</span> in{" "}
              {serviceType},{" "}
              <span className="font-bold">{companyName}</span> could realize{" "}
              <span className="text-blue-700">{annualImpact}</span> in annual
              revenue impact &mdash; a{" "}
              <span className="text-purple-700 font-bold">{roiMultiple}</span>{" "}
              return.
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
    },

    MetricCard: ({ props }) => {
      const {
        label,
        impactValue,
        currentValue,
        targetValue,
        source,
        sourceUrl,
        confidence,
        weight,
        dataClass,
      } = props;

      const badge = dataClassBadge[dataClass];
      const dot = confidenceDot[confidence] ?? "bg-gray-400";
      const confLabel = confidenceLabel[confidence] ?? confidence;

      return (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-5">
          <div className="mb-3">
            <h4 className="text-sm font-semibold text-gray-900">{label}</h4>
            <p className="text-2xl font-bold text-gray-900 mt-1 tabular-nums">
              {impactValue}
            </p>
          </div>

          {currentValue && targetValue && (
            <p className="text-sm text-gray-600 mb-3">
              Current:{" "}
              <span className="font-medium tabular-nums">{currentValue}</span>
              <span className="mx-1.5 text-gray-400">&rarr;</span>
              Target:{" "}
              <span className="font-medium tabular-nums">{targetValue}</span>
            </p>
          )}

          <p className="text-xs text-gray-500 mb-3">
            Source:{" "}
            {sourceUrl ? (
              <a
                href={sourceUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-600 underline hover:text-blue-800"
              >
                {source}
              </a>
            ) : (
              <span>{source}</span>
            )}
          </p>

          <div className="flex items-center gap-3 pt-3 border-t border-gray-100">
            {badge && (
              <span
                className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${badge.className}`}
              >
                {badge.label}
              </span>
            )}

            <span className="flex items-center gap-1.5 text-xs text-gray-500">
              <span
                className={`inline-block h-2 w-2 rounded-full ${dot}`}
                aria-hidden="true"
              />
              {confLabel}
            </span>

            <span className="ml-auto text-xs font-medium text-gray-400 tabular-nums">
              {weight}
            </span>
          </div>
        </div>
      );
    },

    NarrativeBlock: ({ props }) => {
      const { heading, body } = props;

      return (
        <section className="space-y-2">
          <h3 className="text-base font-semibold text-gray-900">{heading}</h3>
          <div className="prose prose-sm max-w-none text-gray-700">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </div>
        </section>
      );
    },

    ProjectionRow: ({ props }) => {
      const { year, impact, cumulative, realizationPercent } = props;

      return (
        <div className={`flex items-center gap-4 py-3 px-4 rounded-md ${year % 2 === 0 ? "bg-gray-50" : "bg-white"}`}>
          <span className="w-20 text-sm font-medium text-gray-900">
            Year {year}
          </span>
          <span className="flex-1 text-sm tabular-nums text-gray-700">
            {impact}
          </span>
          <span className="flex-1 text-sm tabular-nums text-gray-700">
            {cumulative}
          </span>
          <span className="w-24 text-right text-sm tabular-nums text-gray-500">
            {realizationPercent}
          </span>
        </div>
      );
    },

    ConfidenceNote: ({ props }) => {
      const { message, severity } = props;

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
    },

    SkippedKPI: ({ props }) => {
      const { label, reason } = props;

      return (
        <div className="rounded-lg border border-gray-100 bg-gray-50 px-5 py-4">
          <p className="text-sm text-gray-400 line-through">{label}</p>
          <p className="mt-1 text-xs italic text-gray-400">{reason}</p>
        </div>
      );
    },
  },
});
