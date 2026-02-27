"use client";

import { useEffect, useRef } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { Spec } from "@json-render/core";
import { useJsonRenderMessage } from "@json-render/react";
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
  { id: "narrative", label: "Generating narrative", status: "pending" as const },
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
          // Find and update the matching tool_start entry
          const entries = activity.entries;
          const startEntry = entries.find(
            (e) => e.tool === d.tool && e.status === "running"
          );
          if (startEntry) {
            activity.updateEntry(startEntry.id, { status: "done", type: "tool_complete" });
          }
        } else if (d.activityType === "milestone" && d.title === "Analysis complete") {
          // Sweep any remaining running entries to done
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

    // Reset stores for a fresh case
    useCaseStore.getState().reset();
    useStreamStore.getState().reset();
    useActivityStore.getState().reset();

    // Initialize pipeline steps so the PipelineTimeline renders them
    useStreamStore.getState().initializeSteps(DEFAULT_PIPELINE_STEPS);

    setConnectionStatus("connecting");

    // Send a trigger message to start the pipeline
    sendMessage({ text: "start" });
  }, [caseId, sendMessage, setConnectionStatus]);

  // Extract narrative text and calculation results from assistant messages
  useEffect(() => {
    if (messages.length === 0) return;

    const lastMsg = messages[messages.length - 1];
    if (lastMsg.role !== "assistant") return;

    // Build full narrative from text parts and store it.
    // This feeds Supabase persistence (via the orchestrator's result.text) and
    // serves as fallback if json-render spec is not available.
    const textParts: string[] = [];
    for (const part of lastMsg.parts) {
      if (part.type === "text") {
        textParts.push(part.text);
      }
    }
    const fullText = textParts.join("");

    if (fullText) {
      useCaseStore.getState().setNarrative(fullText);
    }

    // Check all assistant messages for calculation results in tool parts.
    // run_calculation may not be in the last message if the LLM does further tool calls.
    for (const msg of messages) {
      if (msg.role !== "assistant") continue;
      for (const part of msg.parts) {
        if (
          part.type === "dynamic-tool" &&
          "state" in part &&
          part.state === "output-available" &&
          part.output &&
          typeof part.output === "object" &&
          "scenarios" in part.output
        ) {
          setResult(part.output as CalculationResult);
        }
      }
    }
  }, [messages, setResult]);

  // Map useChat status to connection status
  useEffect(() => {
    if (status === "submitted") setConnectionStatus("connecting");
    else if (status === "streaming") setConnectionStatus("connected");
    else if (status === "ready") setConnectionStatus("disconnected");
    else if (status === "error") setConnectionStatus("disconnected");
  }, [status, setConnectionStatus]);

  // Extract json-render spec from the last assistant message's parts.
  // pipeJsonRender on the server converts JSONL patches into spec data parts
  // that arrive in the message parts array alongside text parts.
  const lastAssistantMsg = messages.findLast((m) => m.role === "assistant");
  const lastParts = lastAssistantMsg?.parts ?? [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { spec, hasSpec } = useJsonRenderMessage(lastParts as any);

  return {
    isConnected: status === "streaming",
    status,
    stop,
    messages,
    spec: spec as Spec | null,
    hasSpec,
  };
}
