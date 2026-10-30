import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

// Liveness: the process answers. No runtime access, nothing to leak.
export function GET() {
  return NextResponse.json({ ok: true });
}
