import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { caseInputSchema } from "../../../lib/schemas";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
);

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = caseInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { data: caseRow, error: dbError } = await supabase
    .from("cases")
    .insert({
      company_name: parsed.data.companyName,
      industry: parsed.data.industryVertical,
      company_type: parsed.data.companyType,
      estimated_project_cost: parsed.data.estimatedProjectCost,
      service_type: parsed.data.serviceType,
      methodology_id: "experience-transformation-design",
      status: "started",
    })
    .select("id")
    .single();

  if (dbError || !caseRow) {
    return NextResponse.json(
      { error: "Failed to create case", details: dbError?.message },
      { status: 500 }
    );
  }

  return NextResponse.json({ caseId: caseRow.id }, { status: 201 });
}
