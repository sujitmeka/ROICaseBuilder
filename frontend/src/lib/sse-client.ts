export interface SSEEvent {
  type: string;
  timestamp: string;
  stepId?: string;
  payload: Record<string, unknown>;
}

export function createSSEConnection(
  caseId: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Event) => void
): EventSource {
  const es = new EventSource(`/api/cases/${caseId}/stream`);

  es.onmessage = (event) => {
    try {
      const parsed: SSEEvent = JSON.parse(event.data);
      onEvent(parsed);
    } catch {
      // skip malformed events
    }
  };

  es.onerror = onError;

  return es;
}
