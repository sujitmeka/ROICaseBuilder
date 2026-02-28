"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useStreamStore } from "../stores/stream-store";
import { useCaseStore, type CalculationResult } from "../stores/case-store";
import { useActivityStore } from "../stores/activity-store";

// ---------------------------------------------------------------------------
// Default pipeline steps — must match what the backend emits via data-pipeline
// ---------------------------------------------------------------------------

const DEFAULT_PIPELINE_STEPS = [
  { id: "classify", label: "Identifying company", status: "pending" as const },
  { id: "financials", label: "Fetching financial data", status: "pending" as const },
  { id: "benchmarks", label: "Researching benchmarks", status: "pending" as const },
  { id: "calculate", label: "Running ROI calculations", status: "pending" as const },
  { id: "narrative", label: "Finalizing results", status: "pending" as const },
];

// ---------------------------------------------------------------------------
// Custom data part types (must match orchestrator output)
// ---------------------------------------------------------------------------

interface ActivityData {
  activityType: "tool_start" | "tool_complete" | "milestone" | "error";
  title: string;
  tool?: string;
  status: "running" | "done" | "error";
}

interface PipelineData {
  stepId: string;
  status: "active" | "completed";
  message?: string;
}

// ---------------------------------------------------------------------------
// usePipelineStream — wraps useChat from @ai-sdk/react
// ---------------------------------------------------------------------------

export function usePipelineStream(caseId: string | null) {
  const setConnectionStatus = useStreamStore((s) => s.setConnectionStatus);
  const updateStep = useStreamStore((s) => s.updateStep);
  const setResult = useCaseStore((s) => s.setResult);
  const hasStarted = useRef(false);

  const chatHelpers = useChat({
    transport: new DefaultChatTransport({
      api: caseId ? `/api/cases/${caseId}/stream` : "/api/chat",
    }),
    experimental_throttle: 50,

    onData: (dataPart) => {
      const activity = useActivityStore.getState();

      // ---- data-caseinfo part ----
      if (dataPart.type === "data-caseinfo") {
        const d = dataPart.data as {
          companyName: string;
          industry: string;
          serviceType: string;
          caseId: string;
        };
        useCaseStore.getState().setCaseInfo({
          caseId: d.caseId,
          companyName: d.companyName,
          industry: d.industry,
          serviceType: d.serviceType,
        });
      }

      // ---- data-activity parts ----
      if (dataPart.type === "data-activity") {
        const d = dataPart.data as ActivityData;

        if (d.activityType === "milestone" && d.title === "Analysis pipeline started") {
          setConnectionStatus("connected");
          activity.addEntry({
            id: "pipeline-started",
            type: "milestone",
            timestamp: new Date().toISOString(),
            title: "Analysis pipeline started",
            status: "running",
          });
        } else if (d.activityType === "tool_start") {
          activity.addEntry({
            id: dataPart.id ?? `tool-${d.tool}-${Date.now()}`,
            type: "tool_start",
            timestamp: new Date().toISOString(),
            title: d.title,
            tool: d.tool,
            status: "running",
          });
        } else if (d.activityType === "tool_complete") {
          const entries = activity.entries;
          const startEntry = entries.find(
            (e) => e.tool === d.tool && e.status === "running"
          );
          if (startEntry) {
            activity.updateEntry(startEntry.id, { status: "done", type: "tool_complete" });
          }
        } else if (d.activityType === "milestone" && d.title === "Analysis complete") {
          for (const entry of activity.entries) {
            if (entry.status === "running") {
              activity.updateEntry(entry.id, { status: "done" });
            }
          }
          activity.addEntry({
            id: "pipeline-completed",
            type: "milestone",
            timestamp: new Date().toISOString(),
            title: "Analysis complete",
            status: "done",
          });
        } else if (d.activityType === "error") {
          useStreamStore.getState().setError(d.title);
          activity.addEntry({
            id: `pipeline-error-${Date.now()}`,
            type: "error",
            timestamp: new Date().toISOString(),
            title: "Pipeline error",
            detail: d.title,
            status: "error",
          });
        }
      }

      // ---- data-pipeline parts ----
      if (dataPart.type === "data-pipeline") {
        const d = dataPart.data as PipelineData;
        updateStep(d.stepId, {
          status: d.status === "active" ? "active" : "completed",
          message: d.message,
        });
      }

      // ---- data-result part (CalculationResult from run_calculation) ----
      if (dataPart.type === "data-result") {
        const d = dataPart.data as CalculationResult;
        if (d && typeof d === "object" && "scenarios" in d) {
          setResult(d);
        }
      }
    },

    onError: (error) => {
      useStreamStore.getState().setError(error.message);
      setConnectionStatus("disconnected");
    },
  });

  const { messages, sendMessage, status, stop } = chatHelpers;

  // Auto-send initial message to trigger the pipeline
  useEffect(() => {
    if (!caseId || hasStarted.current) return;
    hasStarted.current = true;

    useCaseStore.getState().reset();
    useStreamStore.getState().reset();
    useActivityStore.getState().reset();

    useStreamStore.getState().initializeSteps(DEFAULT_PIPELINE_STEPS);
    setConnectionStatus("connecting");

    sendMessage({ text: "start" });
  }, [caseId, sendMessage, setConnectionStatus]);

  // Store narrative text for Supabase persistence (not displayed in UI).
  // The CalculationResult is captured via the data-result custom data part
  // in onData above — no need to parse message parts.
  useEffect(() => {
    if (messages.length === 0) return;
    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role === "assistant") {
      const textParts: string[] = [];
      for (const part of lastMsg.parts) {
        if (part.type === "text") textParts.push(part.text);
      }
      const fullText = textParts.join("");
      if (fullText) useCaseStore.getState().setNarrative(fullText);
    }
  }, [messages]);

  // Map useChat status to connection status
  useEffect(() => {
    if (status === "submitted") setConnectionStatus("connecting");
    else if (status === "streaming") setConnectionStatus("connected");
    else if (status === "ready") setConnectionStatus("disconnected");
    else if (status === "error") setConnectionStatus("disconnected");
  }, [status, setConnectionStatus]);

  return {
    isConnected: status === "streaming",
    status,
    stop,
  };
}
