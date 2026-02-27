"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { useEventStream } from "../../../hooks/use-event-stream";
import { useStreamStore } from "../../../stores/stream-store";
import { useCaseStore } from "../../../stores/case-store";
import { PipelineTimeline } from "../../../components/streaming/PipelineTimeline";
import { NarrativeStream } from "../../../components/streaming/NarrativeStream";
import { ResultsLayout } from "../../../components/results/ResultsLayout";

const PIPELINE_STEPS = [
  { id: "classify", label: "Identifying company type", status: "pending" as const },
  { id: "financials", label: "Fetching financial data", status: "pending" as const },
  { id: "benchmarks", label: "Searching industry benchmarks", status: "pending" as const },
  { id: "merge", label: "Merging and resolving data", status: "pending" as const },
  { id: "calculate", label: "Running ROI calculations", status: "pending" as const },
  { id: "narrative", label: "Generating executive narrative", status: "pending" as const },
];

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const pipelineSteps = useStreamStore((s) => s.pipelineSteps);
  const connectionStatus = useStreamStore((s) => s.connectionStatus);
  const initializeSteps = useStreamStore((s) => s.initializeSteps);
  const results = useCaseStore((s) => s.calculationResult);
  const narrative = useCaseStore((s) => s.narrative);

  // Initialize pipeline steps on mount
  useEffect(() => {
    initializeSteps(PIPELINE_STEPS);
  }, [initializeSteps]);

  // Connect to SSE stream
  useEventStream(caseId);

  // If we have final results, show the full results view
  if (results) {
    return <ResultsLayout caseId={caseId} />;
  }

  // Otherwise show the streaming progress view
  return (
    <main className="min-h-screen bg-gray-50">
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="text-center mb-12">
          <h1 className="text-2xl font-semibold text-gray-900">
            Analyzing ROI Case
          </h1>
          <p className="mt-2 text-gray-500">
            {connectionStatus === "connecting"
              ? "Connecting to analysis pipeline..."
              : connectionStatus === "connected"
              ? "Analysis in progress"
              : "Waiting for connection..."}
          </p>
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <PipelineTimeline steps={pipelineSteps} />
        </div>

        {narrative && (
          <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Executive Narrative
            </h2>
            <NarrativeStream text={narrative} />
          </div>
        )}
      </div>
    </main>
  );
}
