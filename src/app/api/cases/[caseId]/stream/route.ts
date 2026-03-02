import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createPipelineStream } from "../../../../../lib/agent/orchestrator";
import { checkAuth } from "../../../_auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

/**
 * Convert a UIMessageStream (object-mode ReadableStream) to an SSE Response.
 *
 * We avoid `createUIMessageStreamResponse` from the AI SDK because it chains
 * two pipeThrough calls (JsonToSse → TextEncoder). Next.js 16 Turbopack has a
 * bug where multiple chained pipeThrough calls on a Response body silently
 * produce 0 bytes. This helper combines JSON serialization + text encoding
 * into a single TransformStream to work around the issue.
 */
function toSSEResponse(stream: ReadableStream): Response {
  const encoder = new TextEncoder();
  const sseStream = stream.pipeThrough(
    new TransformStream({
      transform(chunk, controller) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(chunk)}\n\n`));
      },
      flush(controller) {
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      },
    })
  );

  return new Response(sseStream, {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-vercel-ai-ui-message-stream": "v1",
      "x-accel-buffering": "no",
    },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
  const authError = checkAuth(request);
  if (authError) return authError;

  const { caseId } = await params;

  // Look up the case to get inputs
  const { data: caseRow, error: lookupError } = await supabase
    .from("cases")
    .select("company_name, industry, company_type, estimated_project_cost, service_type, status")
    .eq("id", caseId)
    .single();

  if (lookupError || !caseRow) {
    return NextResponse.json(
      { error: `Case ${caseId} not found` },
      { status: 404 }
    );
  }

  if (caseRow.status === "completed") {
    return NextResponse.json(
      { error: "Case already completed" },
      { status: 409 }
    );
  }

  if (caseRow.status === "in_progress") {
    return NextResponse.json(
      { error: "Case already in progress" },
      { status: 409 }
    );
  }

  // Fire-and-forget: don't block stream creation on status update.
  // .then() is required to trigger the Supabase PostgREST HTTP request.
  // If this fails, the after() callback will set status to "completed" or "error" anyway.
  supabase
    .from("cases")
    .update({ status: "in_progress" })
    .eq("id", caseId)
    .then();

  // Create the pipeline stream
  const { stream, resultPromise } = createPipelineStream({
    companyName: caseRow.company_name,
    industry: caseRow.industry,
    companyType: caseRow.company_type ?? "public",
    estimatedProjectCost: caseRow.estimated_project_cost,
    serviceType: caseRow.service_type,
    caseId,
  });

  // Save results to Supabase after pipeline completes.
  // after() guarantees execution in serverless even after the response stream closes.
  after(async () => {
    try {
      const result = await resultPromise;
      await supabase
        .from("cases")
        .update({
          status: "completed",
          result: result.scenarios,
          narrative: result.narrative,
        })
        .eq("id", caseId);
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : "Pipeline failed";
      await supabase
        .from("cases")
        .update({ status: "error", error: errorMessage })
        .eq("id", caseId);
    }
  });

  // Return the streaming response using our single-pipeThrough workaround
  return toSSEResponse(stream);
}
