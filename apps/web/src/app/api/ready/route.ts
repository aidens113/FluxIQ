import { NextResponse } from "next/server";
import { getFluxIQWebReadiness } from "../../../lib/fluxiq";

export const dynamic = "force-dynamic";

// Readiness: 200 only when the runtime is initialized, not draining, and the
// gateway is listening if enabled. The reason is a fixed word, never a path or id.
export function GET() {
  const readiness = getFluxIQWebReadiness();
  if (readiness.ready) return NextResponse.json({ ok: true });
  return NextResponse.json({ ok: false, reason: readiness.reason }, { status: 503 });
}
