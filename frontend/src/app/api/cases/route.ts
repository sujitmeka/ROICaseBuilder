import { NextRequest, NextResponse } from "next/server";
import { caseInputSchema } from "../../../lib/schemas";

const BACKEND_URL = process.env.BACKEND_URL || "http://localhost:8000";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = caseInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  try {
    const backendRes = await fetch(`${BACKEND_URL}/api/cases`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        company_name: parsed.data.companyName,
        industry: parsed.data.industryVertical,
        service_type: parsed.data.serviceType,
      }),
    });

    if (!backendRes.ok) {
      const err = await backendRes.text();
      return NextResponse.json(
        { error: "Backend error", details: err },
        { status: backendRes.status }
      );
    }

    const data = await backendRes.json();
    return NextResponse.json({ caseId: data.case_id }, { status: 201 });
  } catch (err) {
    // If backend is not running, return a case ID anyway for dev
    // so the streaming view is visible (will show connection error)
    const { randomUUID } = await import("crypto");
    const caseId = randomUUID();
    return NextResponse.json(
      { caseId, warning: "Backend not reachable, running in demo mode" },
      { status: 201 }
    );
  }
}
