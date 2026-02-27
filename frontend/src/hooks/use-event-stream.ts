"use client";

import { useEffect, useRef } from "react";
import { createSSEConnection, type SSEEvent } from "../lib/sse-client";
import { useStreamStore } from "../stores/stream-store";
import { useCaseStore, type CalculationResult } from "../stores/case-store";
import { useActivityStore } from "../stores/activity-store";

/**
 * Bug 5 fix: Map backend event types → frontend pipeline step IDs.
 * "started" events mark the step as active; "completed" events mark it done.
 */
const EVENT_TO_STEP: Record<string, { stepId: string; action: "active" | "completed" }> = {
  // Company identification
  company_identified: { stepId: "classify", action: "active" },
  company_classified: { stepId: "classify", action: "completed" },
  // Data fetching
  data_fetch_started: { stepId: "financials", action: "active" },
  data_fetch_completed: { stepId: "financials", action: "completed" },
  // Benchmark search
  benchmark_search_started: { stepId: "benchmarks", action: "active" },
  benchmark_found: { stepId: "benchmarks", action: "completed" },
  benchmark_search_completed: { stepId: "benchmarks", action: "completed" },
  // Calculation
  calculation_started: { stepId: "calculate", action: "active" },
  calculation_completed: { stepId: "calculate", action: "completed" },
  // Merge (data resolution)
  conflict_detected: { stepId: "merge", action: "active" },
  conflict_resolved: { stepId: "merge", action: "completed" },
  // Narrative
  narrative_started: { stepId: "narrative", action: "active" },
  narrative_chunk: { stepId: "narrative", action: "active" },
  narrative_completed: { stepId: "narrative", action: "completed" },
};

export function useEventStream(caseId: string | null) {
  const esRef = useRef<EventSource | null>(null);
  const setConnectionStatus = useStreamStore((s) => s.setConnectionStatus);
  const updateStep = useStreamStore((s) => s.updateStep);
  const appendNarrative = useCaseStore((s) => s.appendNarrative);
  const setResult = useCaseStore((s) => s.setResult);

  useEffect(() => {
    if (!caseId) return;

    // Reset stores for fresh case
    useCaseStore.getState().reset();
    useStreamStore.getState().reset();
    useActivityStore.getState().reset();

    setConnectionStatus("connecting");

    const handleEvent = (event: SSEEvent) => {
      const activity = useActivityStore.getState();

      // Pipeline lifecycle events
      switch (event.type) {
        case "pipeline_started":
          setConnectionStatus("connected");
          if (event.payload.company_name) {
            useCaseStore.getState().setCaseInfo({
              caseId: caseId!,
              companyName: event.payload.company_name as string,
              industry: (event.payload.industry as string) ?? "",
              serviceType: (event.payload.service_type as string) ?? "",
            });
          }
          updateStep("classify", { status: "active" });
          activity.addEntry({
            id: "pipeline-started",
            type: "milestone",
            timestamp: event.timestamp,
            title: "Analysis pipeline started",
            status: "running",
          });
          return;

        case "narrative_chunk":
          appendNarrative((event.payload.text as string) ?? "");
          break; // also falls through to step mapping below

        case "pipeline_completed":
          // Bug 3 fix: extract result and call setResult()
          if (event.payload.result) {
            setResult(event.payload.result as CalculationResult);
          }
          // Mark all remaining steps as completed
          for (const step of ["classify", "financials", "benchmarks", "merge", "calculate", "narrative"]) {
            updateStep(step, { status: "completed" });
          }
          // Sweep any tool activities still marked "running" to "done"
          for (const entry of activity.entries) {
            if (entry.status === "running") {
              activity.updateEntry(entry.id, { status: "done" });
            }
          }
          activity.addEntry({
            id: "pipeline-completed",
            type: "milestone",
            timestamp: event.timestamp,
            title: "Analysis complete",
            status: "done",
          });
          esRef.current?.close();
          setConnectionStatus("disconnected");
          return;

        case "pipeline_error": {
          const errorMsg = (event.payload.error as string) ?? "Analysis failed. Please try again.";
          useStreamStore.getState().setError(errorMsg);
          activity.addEntry({
            id: `error-${event.timestamp}`,
            type: "error",
            timestamp: event.timestamp,
            title: "Pipeline error",
            detail: errorMsg,
            status: "error",
          });
          esRef.current?.close();
          setConnectionStatus("disconnected");
          return;
        }

        case "agent_thinking":
          activity.addEntry({
            id: `think-${event.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
            type: "thinking",
            timestamp: event.timestamp,
            title: "Agent reasoning",
            detail: event.payload.text as string,
          });
          break;

        case "tool_call_started":
          activity.addEntry({
            id: (event.payload.tool_use_id as string) || `tool-${event.payload.tool}-${event.timestamp}`,
            type: "tool_start",
            timestamp: event.timestamp,
            title: (event.payload.input_summary as string) || `Using ${event.payload.tool}`,
            tool: event.payload.tool as string,
            status: "running",
          });
          break;

        case "tool_call_completed":
          activity.updateEntry(
            (event.payload.tool_use_id as string) || `tool-${event.payload.tool}-${event.timestamp}`,
            { status: "done", type: "tool_complete" }
          );
          break;

        case "data_point_found":
          activity.addEntry({
            id: `data-${event.timestamp}-${Math.random().toString(36).slice(2, 6)}`,
            type: "data_found",
            timestamp: event.timestamp,
            title: (event.payload.label as string) || "Data point found",
            detail: event.payload.value != null
              ? `${event.payload.label ?? "Value"}: ${event.payload.value}`
              : undefined,
            status: "done",
          });
          break;
      }

      // Bug 5 fix: map event types to pipeline step updates
      const mapping = EVENT_TO_STEP[event.type];
      if (mapping) {
        updateStep(mapping.stepId, {
          status: mapping.action === "active" ? "active" : "completed",
          message: (event.payload.message as string) ?? undefined,
        });
      }
    };

    const handleError = () => {
      if (esRef.current?.readyState === EventSource.CLOSED) {
        setConnectionStatus("disconnected");
      }
    };

    esRef.current = createSSEConnection(caseId, handleEvent, handleError);

    return () => {
      esRef.current?.close();
      setConnectionStatus("disconnected");
    };
  }, [caseId, setConnectionStatus, updateStep, appendNarrative, setResult]);

  return {
    isConnected: useStreamStore((s) => s.connectionStatus === "connected"),
    error: null,
    disconnect: () => {
      esRef.current?.close();
      setConnectionStatus("disconnected");
    },
  };
}
