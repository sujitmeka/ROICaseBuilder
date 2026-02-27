import { NextRequest, NextResponse } from "next/server";
import { caseInputSchema } from "../../../lib/schemas";
import { randomUUID } from "crypto";

export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = caseInputSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid input", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const caseId = randomUUID();

  // TODO: spawn Python agent pipeline and connect to backend
  return NextResponse.json({ caseId }, { status: 201 });
}
