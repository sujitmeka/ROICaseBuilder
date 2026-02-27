export interface SSEEvent {
  type: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export function createSSEConnection(
  caseId: string,
  onEvent: (event: SSEEvent) => void,
  onError: (error: Event) => void,
  timeoutMs = 30_000
): EventSource {
  const es = new EventSource(`/api/cases/${caseId}/stream`);
  let receivedFirstEvent = false;

  const timeout = setTimeout(() => {
    if (!receivedFirstEvent) {
      es.close();
      onError(new Event("timeout"));
    }
  }, timeoutMs);

  es.onmessage = (event) => {
    receivedFirstEvent = true;
    clearTimeout(timeout);
    try {
      const raw = JSON.parse(event.data);
      // The backend puts `type` at the top level of the JSON payload.
      // Everything else becomes `payload` for the handler.
      const { type, timestamp, ...rest } = raw;
      const parsed: SSEEvent = { type, timestamp, payload: rest };
      onEvent(parsed);
    } catch {
      // skip malformed events
    }
  };

  es.onerror = (err) => {
    clearTimeout(timeout);
    onError(err);
  };

  return es;
}
