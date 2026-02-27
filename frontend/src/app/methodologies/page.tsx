"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { supabase } from "../../lib/supabase";

interface BenchmarkRanges {
  conservative: number;
  moderate: number;
  aggressive: number;
}

interface KPI {
  id: string;
  label: string;
  weight: number;
  formula: string;
  inputs: string[];
  benchmark_ranges: BenchmarkRanges;
  benchmark_source: string;
  enabled: boolean;
}

interface Methodology {
  id: string;
  name: string;
  version: string;
  service_type: string;
  applicable_industries: string[];
  kpis: KPI[];
  realization_curve: number[];
  confidence_discounts: Record<string, number>;
}

function formatPercent(v: number) {
  return v < 1 ? `${(v * 100).toFixed(0)}%` : v.toString();
}

function formatWeight(v: number) {
  return `${(v * 100).toFixed(0)}%`;
}

function IndustryBadge({ industry }: { industry: string }) {
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 border border-blue-100">
      {industry.replace(/_/g, " ")}
    </span>
  );
}

function KPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="border border-gray-200 rounded-lg p-5 bg-white">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="font-semibold text-gray-900">{kpi.label}</h3>
          <p className="mt-1 text-sm text-gray-500 font-mono">{kpi.formula}</p>
        </div>
        <span className="shrink-0 inline-flex items-center px-2.5 py-1 rounded-md text-sm font-semibold bg-gray-100 text-gray-700">
          {formatWeight(kpi.weight)} weight
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-md bg-green-50 border border-green-100 p-3 text-center">
          <div className="text-xs text-green-600 font-medium uppercase tracking-wide">Conservative</div>
          <div className="mt-1 text-lg font-semibold text-green-700">{formatPercent(kpi.benchmark_ranges.conservative)}</div>
        </div>
        <div className="rounded-md bg-blue-50 border border-blue-100 p-3 text-center">
          <div className="text-xs text-blue-600 font-medium uppercase tracking-wide">Moderate</div>
          <div className="mt-1 text-lg font-semibold text-blue-700">{formatPercent(kpi.benchmark_ranges.moderate)}</div>
        </div>
        <div className="rounded-md bg-amber-50 border border-amber-100 p-3 text-center">
          <div className="text-xs text-amber-600 font-medium uppercase tracking-wide">Aggressive</div>
          <div className="mt-1 text-lg font-semibold text-amber-700">{formatPercent(kpi.benchmark_ranges.aggressive)}</div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-gray-400">Inputs:</span>
        {kpi.inputs.map((input) => (
          <span key={input} className="inline-block px-2 py-0.5 rounded text-xs bg-gray-100 text-gray-600 font-mono">
            {input}
          </span>
        ))}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Source: {kpi.benchmark_source}
      </p>
    </div>
  );
}

export default function MethodologiesPage() {
  const [methodologies, setMethodologies] = useState<Methodology[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      const { data, error: err } = await supabase
        .from("methodologies")
        .select("*")
        .eq("enabled", true);

      if (err) {
        setError(err.message);
      } else {
        setMethodologies(data ?? []);
      }
      setLoading(false);
    }
    load();
  }, []);

  return (
    <main className="max-w-4xl mx-auto px-6 py-12">
      <h1 className="text-2xl font-semibold tracking-tight text-gray-900">
        Methodologies
      </h1>
      <p className="mt-2 text-gray-500">
        How we calculate ROI. Every number in your case traces back to these
        formulas and benchmarks.
      </p>

      {loading && (
        <div className="mt-12 text-center text-gray-400">Loading methodologies...</div>
      )}

      {error && (
        <div className="mt-8 rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      {methodologies.map((m) => (
        <div key={m.id} className="mt-8">
          <div className="border border-gray-200 rounded-lg bg-white p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-gray-900">{m.name}</h2>
                <p className="mt-1 text-sm text-gray-500">
                  v{m.version} &middot; {m.service_type.replace(/-/g, " ")}
                </p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {m.applicable_industries.map((ind) => (
                <IndustryBadge key={ind} industry={ind} />
              ))}
            </div>

            {/* Realization Curve */}
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Realization Curve
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Percentage of total impact realized each year
              </p>
              <div className="mt-3 flex gap-4">
                {m.realization_curve.map((pct, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-gray-500">Year {i + 1}:</span>
                    <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-gray-700">{(pct * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Confidence Discounts */}
            <div className="mt-6 border-t border-gray-100 pt-5">
              <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide">
                Confidence Discounts
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Multiplier applied based on data quality tier
              </p>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {Object.entries(m.confidence_discounts).map(([tier, mult]) => (
                  <div key={tier} className="rounded-md bg-gray-50 border border-gray-100 p-3 text-center">
                    <div className="text-xs text-gray-500 font-medium">{tier.replace(/_/g, " ")}</div>
                    <div className="mt-1 text-lg font-semibold text-gray-800">{mult}x</div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-4">
              KPI Definitions ({m.kpis.length})
            </h3>
            <div className="space-y-4">
              {m.kpis.map((kpi) => (
                <KPICard key={kpi.id} kpi={kpi} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </main>
  );
}
