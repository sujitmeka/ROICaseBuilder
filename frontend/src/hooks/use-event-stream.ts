"use client";

import { useEffect, useRef } from "react";
import { createSSEConnection, type SSEEvent } from "../lib/sse-client";
import { useStreamStore } from "../stores/stream-store";
import { useCaseStore } from "../stores/case-store";

export function useEventStream(caseId: string | null) {
  const esRef = useRef<EventSource | null>(null);
  const setConnectionStatus = useStreamStore((s) => s.setConnectionStatus);
  const updateStep = useStreamStore((s) => s.updateStep);
  const appendNarrative = useCaseStore((s) => s.appendNarrative);

  useEffect(() => {
    if (!caseId) return;

    setConnectionStatus("connecting");

    const handleEvent = (event: SSEEvent) => {
      switch (event.type) {
        case "pipeline_started":
          setConnectionStatus("connected");
          break;
        case "narrative_chunk":
          appendNarrative((event.payload.text as string) ?? "");
          break;
        case "pipeline_completed":
        case "pipeline_error":
          esRef.current?.close();
          setConnectionStatus("disconnected");
          break;
        default:
          if (event.stepId) {
            updateStep(event.stepId, {
              status: event.type.includes("error") ? "error" : "completed",
              message: (event.payload.message as string) ?? undefined,
            });
          }
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
  }, [caseId, setConnectionStatus, updateStep, appendNarrative]);

  return {
    isConnected: useStreamStore((s) => s.connectionStatus === "connected"),
    error: null,
    disconnect: () => {
      esRef.current?.close();
      setConnectionStatus("disconnected");
    },
  };
}
