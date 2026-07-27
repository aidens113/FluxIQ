import { NextResponse } from "next/server";
import { getFluxIQ } from "../../../../lib/fluxiq";

export function GET() {
  const fluxiq = getFluxIQ();
  return NextResponse.json({
    ok: true,
    paths: fluxiq.paths,
    domains: fluxiq.domains.summaries()
  });
}

export async function POST() {
  const result = await getFluxIQ().setup();
  return NextResponse.json({
    ok: true,
    ...result
  });
}
