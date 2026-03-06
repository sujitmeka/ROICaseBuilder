"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useShallow } from "zustand/react/shallow";
import { usePipelineStream } from "../../../hooks/use-event-stream";
import { useStreamStore } from "../../../stores/stream-store";
import { useCaseStore } from "../../../stores/case-store";
import { HeroMetricBar } from "../../../components/results/HeroMetricBar";
import { ScenarioToggle } from "../../../components/results/ScenarioToggle";

const StreamingChat = dynamic(
  () => import("../../../components/streaming/StreamingChat").then(m => ({ default: m.StreamingChat })),
  { ssr: false }
);
const ResultsView = dynamic(
  () => import("../../../components/results/ResultsView").then(m => ({ default: m.ResultsView })),
  { ssr: false }
);
const BackboneView = dynamic(
  () => import("../../../components/results/BackboneView").then(m => ({ default: m.BackboneView })),
  { ssr: false }
);

type ResultsTab = "results" | "backbone";

const TABS: { value: ResultsTab; label: string }[] = [
  { value: "results", label: "Results" },
  { value: "backbone", label: "Backbone" },
];

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;
  const [activeTab, setActiveTab] = useState<ResultsTab>("results");

  const { connectionStatus, error } = useStreamStore(
    useShallow((s) => ({
      connectionStatus: s.connectionStatus,
      error: s.error,
    }))
  );
  const { results, activeScenario, companyName, serviceType } = useCaseStore(
    useShallow((s) => ({
      results: s.calculationResult,
      activeScenario: s.activeScenario,
      companyName: s.companyName,
      serviceType: s.serviceType,
    }))
  );
  // Connect to AI SDK streaming pipeline
  const { isConnected, messages } = usePipelineStream(caseId);

  // Results view — show when calculation data is available
  if (results) {
    return (
      <main className="min-h-screen bg-black">
        {/* Sticky header with hero metrics */}
        <div className="sticky top-0 z-10 bg-black/95 backdrop-blur border-b border-[#2a2a2a]">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold text-white">
                ROI Case: {results.company_name}
              </h1>
              <div className="flex items-center gap-3">
                {activeTab === "results" && <ScenarioToggle />}
                {isConnected ? (
                  <span className="flex items-center gap-1.5 text-xs text-white">
                    <span className="inline-block h-2 w-2 rounded-full bg-white animate-pulse" />
                    Updating
                  </span>
                ) : null}
              </div>
            </div>
            {activeTab === "results" && (
              <HeroMetricBar
                totalImpact={results.scenarios[activeScenario].total_annual_impact}
                roi={results.scenarios[activeScenario].roi_percentage ?? 0}
                roiMultiple={results.scenarios[activeScenario].roi_multiple ?? 0}
                threeYearCumulative={results.scenarios[activeScenario].cumulative_3yr_impact}
                scenario={activeScenario}
              />
            )}
          </div>
        </div>

        {/* Tab navigation */}
        <div className="max-w-4xl mx-auto px-6 pt-6">
          <div
            className="inline-flex rounded-lg border border-[#2a2a2a] bg-[#111111] p-1"
            role="tablist"
            aria-label="View selector"
          >
            {TABS.map((tab) => (
              <button
                key={tab.value}
                role="tab"
                aria-selected={activeTab === tab.value}
                onClick={() => setActiveTab(tab.value)}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${
                  activeTab === tab.value
                    ? "bg-white text-black shadow-sm"
                    : "text-[#707070] hover:text-white"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Tab content */}
        <div className="max-w-4xl mx-auto px-6 py-8">
          {activeTab === "results" ? (
            <ResultsView
              result={results}
              scenario={activeScenario}
              serviceType={serviceType || "Experience Transformation & Design"}
            />
          ) : (
            <BackboneView />
          )}
        </div>
      </main>
    );
  }

  // Streaming progress view — show while pipeline is running
  return (
    <main className="min-h-screen bg-black">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-semibold text-white">
            {companyName ? `Analyzing ${companyName}` : "Analyzing ROI Case"}
          </h1>
          <p className="mt-2 text-[#a8a8a8]">
            {connectionStatus === "connecting"
              ? "Connecting to analysis pipeline..."
              : connectionStatus === "connected"
              ? "Analysis in progress"
              : "Waiting for connection..."}
          </p>
          {error ? (
            <div className="mt-6 bg-red-950/50 border border-red-900/50 rounded-lg p-4 text-left">
              <p className="text-red-400 text-sm font-medium">Analysis Error</p>
              <p className="text-red-400 text-sm mt-1">{error}</p>
            </div>
          ) : null}
        </div>

        {/* Collapsible tool call stream (Claude.ai-style) */}
        <StreamingChat messages={messages} />
      </div>
    </main>
  );
}
