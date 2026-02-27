"use client";

import { useCaseStore } from "../../stores/case-store";
import { HeroMetricBar } from "./HeroMetricBar";
import { ScenarioToggle } from "./ScenarioToggle";
import { NarrativePanel } from "./NarrativePanel";
import { AuditSidebar } from "./AuditSidebar";

interface Props {
  caseId: string;
}

export function ResultsLayout({ caseId }: Props) {
  const results = useCaseStore((s) => s.calculationResult);
  const narrative = useCaseStore((s) => s.narrative);
  const activeScenario = useCaseStore((s) => s.activeScenario);
  const auditEntries = useCaseStore((s) => s.auditEntries);

  if (!results) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-gray-500">Loading results...</p>
      </div>
    );
  }

  const scenarioData = results.scenarios[activeScenario];
  const realization = results.realization;
  const threeYearCumulative =
    scenarioData.totalImpact *
    (realization.year1 + realization.year2 + realization.year3);

  return (
    <main className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 border-b bg-white/95 backdrop-blur">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <h1 className="text-xl font-semibold">ROI Case</h1>
            <ScenarioToggle />
          </div>
          <HeroMetricBar
            totalImpact={scenarioData.totalImpact}
            roi={scenarioData.roi}
            revenueAtRisk={scenarioData.revenueAtRisk}
            threeYearCumulative={threeYearCumulative}
            scenario={activeScenario}
          />
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
            <NarrativePanel narrative={narrative} />
          </div>
          <div className="lg:col-span-2">
            <AuditSidebar
              entries={auditEntries}
              activeSectionId={null}
              scenario={activeScenario}
            />
          </div>
        </div>
      </div>
    </main>
  );
}
