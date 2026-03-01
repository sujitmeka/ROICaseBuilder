import { NextRequest, NextResponse } from "next/server";
import { after } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createUIMessageStreamResponse } from "ai";
import { createPipelineStream } from "../../../../../lib/agent/orchestrator";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ caseId: string }> }
) {
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

  // Mark as in_progress to prevent duplicate pipeline runs
  await supabase
    .from("cases")
    .update({ status: "in_progress" })
    .eq("id", caseId);

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

  // Return the streaming response
  // createUIMessageStreamResponse wraps the ReadableStream with the correct
  // headers (Content-Type, x-vercel-ai-ui-message-stream, etc.)
  return createUIMessageStreamResponse({ stream });
}
