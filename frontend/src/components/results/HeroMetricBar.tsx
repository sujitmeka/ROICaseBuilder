"use client";

import { formatCurrency, formatPercent } from "../../lib/utils";
import type { Scenario } from "../../stores/case-store";

interface Props {
  totalImpact: number;
  roi: number;
  revenueAtRisk: number;
  threeYearCumulative: number;
  scenario: Scenario;
}

export function HeroMetricBar({
  totalImpact,
  roi,
  revenueAtRisk,
  threeYearCumulative,
}: Props) {
  const metrics = [
    {
      label: "Annual Impact",
      value: formatCurrency(totalImpact),
    },
    {
      label: "ROI",
      value: formatPercent(roi),
    },
    {
      label: "Revenue at Risk",
      value: formatCurrency(revenueAtRisk),
    },
    {
      label: "3-Year Cumulative",
      value: formatCurrency(threeYearCumulative),
    },
  ];

  return (
    <div
      className="grid grid-cols-2 lg:grid-cols-4 gap-4"
      role="region"
      aria-label="Key ROI metrics"
    >
      {metrics.map((metric) => (
        <div key={metric.label} className="rounded-lg border bg-white p-4">
          <p className="text-xs font-medium text-gray-500 uppercase tracking-wide">
            {metric.label}
          </p>
          <p className="text-2xl font-bold mt-1">{metric.value}</p>
        </div>
      ))}
    </div>
  );
}
