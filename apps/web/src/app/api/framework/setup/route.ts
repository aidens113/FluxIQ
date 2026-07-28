import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../../lib/auth";
import { getFluxIQ } from "../../../../lib/fluxiq";

export async function GET() {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    paths: fluxiq.paths,
    domains: fluxiq.domains.summaries()
  });
}

export async function POST() {
  const auth = await requireFluxIQUser();
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const result = await getFluxIQ().setup();
  return NextResponse.json({
    ok: true,
    ...result
  });
}
