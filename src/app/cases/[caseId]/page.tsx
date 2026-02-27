"use client";

import { useParams } from "next/navigation";
import { usePipelineStream } from "../../../hooks/use-event-stream";
import { useStreamStore } from "../../../stores/stream-store";
import { useCaseStore } from "../../../stores/case-store";
import { ActivityFeed } from "../../../components/streaming/ActivityFeed";
import { NarrativeStream } from "../../../components/streaming/NarrativeStream";
import { ResultsLayout } from "../../../components/results/ResultsLayout";

export default function CasePage() {
  const params = useParams();
  const caseId = params.caseId as string;

  const connectionStatus = useStreamStore((s) => s.connectionStatus);
  const error = useStreamStore((s) => s.error);
  const results = useCaseStore((s) => s.calculationResult);
  const narrative = useCaseStore((s) => s.narrative);
  const companyName = useCaseStore((s) => s.companyName);

  // Connect to AI SDK streaming pipeline
  usePipelineStream(caseId);

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

        <div className="bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
          <ActivityFeed />
        </div>

        {narrative && (
          <div className="mt-8 bg-white rounded-lg border border-gray-200 p-6 shadow-sm">
            <h2 className="text-lg font-medium text-gray-900 mb-4">
              Executive Narrative
            </h2>
            <NarrativeStream text={narrative} streaming={connectionStatus === "connected"} />
          </div>
        )}
      </div>
    </main>
  );
}
