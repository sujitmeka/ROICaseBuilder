import { NextRequest } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;
  const lastEventId = request.headers.get("Last-Event-ID");

  try {
    const url = `${BACKEND_URL}/api/cases/${caseId}/stream`;
    const headers: Record<string, string> = {
      Accept: "text/event-stream",
    };
    if (lastEventId) {
      headers["Last-Event-ID"] = lastEventId;
    }

    const backendRes = await fetch(url, { headers });

    if (!backendRes.ok || !backendRes.body) {
      throw new Error(`Backend returned ${backendRes.status}`);
    }

    // Proxy the SSE stream directly
    return new Response(backendRes.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  } catch {
    // Backend not available — send a helpful error event
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode(
            `event: pipeline_error\ndata: ${JSON.stringify({
              message:
                "Backend not reachable. Start the backend with: uvicorn backend.main:app --port 8000",
            })}\n\n`
          )
        );
        controller.close();
      },
    });

    return new Response(stream, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
      },
    });
  }
}
