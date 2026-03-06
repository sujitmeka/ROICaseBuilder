import Link from "next/link";
import { supabase } from "../../lib/supabase";

interface KPI {
  id: string;
  label: string;
  formula: string;
  inputs: string[];
  enabled: boolean;
  typical_range: { low: number; high: number };
  reasoning_guidance: string;
  reference_sources: string[];
}

interface Methodology {
  id: string;
  name: string;
  version: string;
  description: string;
  service_type: string;
  applicable_industries: string[];
  kpis: KPI[];
  realization_curve: number[];
}

function formatPercent(v: number) {
  return v < 1 ? `${(v * 100).toFixed(0)}%` : v.toString();
}

function IndustryBadge({ industry }: { industry: string }) {
  return (
    <span className="inline-block px-2.5 py-0.5 rounded-full text-xs font-medium bg-[#1a1a1a] text-[#a8a8a8] border border-[#2a2a2a]">
      {industry.replace(/_/g, " ")}
    </span>
  );
}

function KPICard({ kpi }: { kpi: KPI }) {
  return (
    <div className="border border-[#2a2a2a] rounded-lg p-5 bg-[#111111]">
      <div>
        <h3 className="font-semibold text-white">{kpi.label}</h3>
        <p className="mt-1 text-sm text-[#707070] font-mono">{kpi.formula}</p>
      </div>

      <div className="mt-4 rounded-md bg-[#0a0a0a] border border-[#2a2a2a] p-3">
        <div className="text-xs text-[#707070] font-medium uppercase tracking-wide">Typical Range</div>
        <div className="mt-1 text-lg font-semibold text-white">
          {formatPercent(kpi.typical_range.low)} – {formatPercent(kpi.typical_range.high)}
        </div>
      </div>

      {kpi.reasoning_guidance && (
        <div className="mt-3">
          <div className="text-xs text-[#707070] font-medium uppercase tracking-wide">Reasoning Guidance</div>
          <p className="mt-1 text-sm text-[#a8a8a8]">{kpi.reasoning_guidance}</p>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-xs text-[#707070]">Inputs:</span>
        {kpi.inputs.map((input) => (
          <span key={input} className="inline-block px-2 py-0.5 rounded text-xs bg-[#1a1a1a] text-[#a8a8a8] font-mono">
            {input}
          </span>
        ))}
      </div>

      {kpi.reference_sources.length > 0 && (
        <div className="mt-3">
          <span className="text-xs text-[#707070]">Sources:</span>
          <ul className="mt-1 list-disc list-inside text-xs text-[#707070]">
            {kpi.reference_sources.map((src, i) => (
              <li key={i}>{src}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export default async function MethodologiesPage() {
  const { data: methodologies, error } = await supabase
    .from("methodologies")
    .select("*")
    .eq("enabled", true);

  if (error) {
    return (
      <main className="max-w-4xl mx-auto px-12 py-12">
        <div className="rounded-lg border border-red-900/50 bg-red-950/50 p-4 text-sm text-red-400">
          {error.message}
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-12 py-12">
      <h1 className="text-4xl font-light tracking-tight text-white">
        Methodologies
      </h1>
      <p className="mt-2 text-[#a8a8a8]">
        How we evaluate ROI. Each methodology defines what metrics to assess and
        provides guidance for company-specific impact analysis.
      </p>

      {(methodologies ?? []).map((m: Methodology) => (
        <div key={m.id} className="mt-8">
          <div className="border border-[#2a2a2a] rounded-lg bg-[#111111] p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-semibold text-white">{m.name}</h2>
                <p className="mt-1 text-sm text-[#707070]">
                  v{m.version} &middot; {m.service_type.replace(/-/g, " ")}
                </p>
                {m.description && (
                  <p className="mt-2 text-sm text-[#a8a8a8]">{m.description}</p>
                )}
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-1.5">
              {m.applicable_industries.map((ind) => (
                <IndustryBadge key={ind} industry={ind} />
              ))}
            </div>

            {/* Realization Curve */}
            <div className="mt-6 border-t border-[#2a2a2a] pt-5">
              <h3 className="text-sm font-semibold text-[#707070] uppercase tracking-wide">
                Realization Curve
              </h3>
              <p className="mt-1 text-sm text-[#707070]">
                Percentage of total impact realized each year
              </p>
              <div className="mt-3 flex gap-4">
                {m.realization_curve.map((pct, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-sm text-[#707070]">Year {i + 1}:</span>
                    <div className="w-24 h-2 bg-[#2a2a2a] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-white rounded-full"
                        style={{ width: `${pct * 100}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium text-white">{(pct * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* KPIs */}
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-[#707070] uppercase tracking-wide mb-4">
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
