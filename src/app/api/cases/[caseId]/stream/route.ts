import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { runPipeline, type SSEEvent } from "../../../../../lib/agent/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300; // 5 min max for long pipelines

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const { caseId } = await params;

  // Look up the case to get inputs
  const { data: caseRow, error: lookupError } = await supabase
    .from("cases")
    .select("company_name, industry, service_type, status")
    .eq("id", caseId)
    .single();

  if (lookupError || !caseRow) {
    // Return error as SSE event
    return sseErrorResponse(`Case ${caseId} not found`);
  }

  // If case is already completed, return the result as a single SSE event
  if (caseRow.status === "completed") {
    return sseErrorResponse("Case already completed. Refresh the page to view results.");
  }

  const encoder = new TextEncoder();
  let seqId = 0;

  const stream = new ReadableStream({
    async start(controller) {
      function onEvent(event: SSEEvent) {
        seqId++;
        const payload = JSON.stringify(event);
        controller.enqueue(encoder.encode(`data: ${payload}\nid: ${seqId}\n\n`));
      }

      try {
        const result = await runPipeline({
          companyName: caseRow.company_name,
          industry: caseRow.industry,
          serviceType: caseRow.service_type,
          caseId,
          onEvent,
        });

        // Save results to Supabase
        await supabase
          .from("cases")
          .update({
            status: "completed",
            result: result.scenarios,
            narrative: result.narrative,
          })
          .eq("id", caseId);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Pipeline failed";

        // Save error to Supabase
        await supabase
          .from("cases")
          .update({ status: "error", error: errorMessage })
          .eq("id", caseId);

        // Send error event
        seqId++;
        const errorEvent = JSON.stringify({
          type: "pipeline_error",
          error: errorMessage,
          case_id: caseId,
          timestamp: new Date().toISOString(),
        });
        controller.enqueue(encoder.encode(`data: ${errorEvent}\nid: ${seqId}\n\n`));
      } finally {
        controller.close();
      }
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

function sseErrorResponse(message: string): Response {
  const encoder = new TextEncoder();
  const payload = JSON.stringify({
    type: "pipeline_error",
    error: message,
    timestamp: new Date().toISOString(),
  });
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(encoder.encode(`data: ${payload}\n\n`));
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
