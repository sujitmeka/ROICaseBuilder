"use client";

import { useParams } from "next/navigation";
import { usePipelineStream } from "../../../hooks/use-event-stream";
import { useStreamStore } from "../../../stores/stream-store";
import { useCaseStore } from "../../../stores/case-store";
import { StreamingChat } from "../../../components/streaming/StreamingChat";
import { HeroMetricBar } from "../../../components/results/HeroMetricBar";
import { ScenarioToggle } from "../../../components/results/ScenarioToggle";
import { ResultsView } from "../../../components/results/ResultsView";

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const connectionStatus = useStreamStore((s) => s.connectionStatus);
  const error = useStreamStore((s) => s.error);
  const results = useCaseStore((s) => s.calculationResult);
  const activeScenario = useCaseStore((s) => s.activeScenario);
  const companyName = useCaseStore((s) => s.companyName);
  const serviceType = useCaseStore((s) => s.serviceType);
  const narrative = useCaseStore((s) => s.narrative);

  // Connect to AI SDK streaming pipeline
  const { isConnected, messages } = usePipelineStream(caseId);

  // Results view — show when calculation data is available
  if (results) {
    return (
      <main className="min-h-screen bg-gray-50">
        {/* Sticky header with hero metrics */}
        <div className="sticky top-0 z-10 bg-white/95 backdrop-blur border-b border-gray-200">
          <div className="max-w-5xl mx-auto px-6 py-4">
            <div className="flex items-center justify-between mb-4">
              <h1 className="text-lg font-semibold text-gray-900">
                ROI Case: {results.company_name}
              </h1>
              <div className="flex items-center gap-3">
                <ScenarioToggle />
                {isConnected && (
                  <span className="flex items-center gap-1.5 text-xs text-blue-600">
                    <span className="inline-block h-2 w-2 rounded-full bg-blue-500 animate-pulse" />
                    Updating
                  </span>
                )}
              </div>
            </div>
            <HeroMetricBar
              totalImpact={results.scenarios[activeScenario].total_annual_impact}
              roi={results.scenarios[activeScenario].roi_percentage ?? 0}
              roiMultiple={results.scenarios[activeScenario].roi_multiple ?? 0}
              threeYearCumulative={results.scenarios[activeScenario].cumulative_3yr_impact}
              scenario={activeScenario}
            />
          </div>
        </div>

        {/* Structured results */}
        <div className="max-w-4xl mx-auto px-6 py-8">
          <ResultsView
            result={results}
            scenario={activeScenario}
            serviceType={serviceType || "Experience Transformation & Design"}
            narrative={narrative}
          />
        </div>
      </main>
    );
  }

  // Streaming progress view — show while pipeline is running
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-semibold text-gray-900">
            {companyName ? `Analyzing ${companyName}` : "Analyzing ROI Case"}
          </h1>
          <p className="mt-2 text-gray-500">
            {connectionStatus === "connecting"
              ? "Connecting to analysis pipeline..."
              : connectionStatus === "connected"
              ? "Analysis in progress"
              : "Waiting for connection..."}
          </p>
          {error && (
            <div className="mt-6 bg-red-50 border border-red-200 rounded-lg p-4 text-left">
              <p className="text-red-800 text-sm font-medium">Analysis Error</p>
              <p className="text-red-600 text-sm mt-1">{error}</p>
            </div>
          )}
        </div>

        {/* Collapsible tool call stream (Claude.ai-style) */}
        <StreamingChat messages={messages} />
      </div>
    </main>
  );
}
