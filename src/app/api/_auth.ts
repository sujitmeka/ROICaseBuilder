import { NextRequest, NextResponse } from "next/server";

export function checkAuth(request: NextRequest): NextResponse | null {
  const apiKey = process.env.CPROI_API_KEY;
  if (!apiKey) return null; // No key configured = local dev, skip auth

  const authHeader = request.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ") || authHeader.slice(7) !== apiKey) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return null;
}
