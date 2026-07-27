import { NextResponse } from "next/server";
import { getFluxIQ } from "../../../../../lib/fluxiq";

type RouteParams = {
  params: Promise<{
    programId: string;
    endpoint: string;
  }>;
};

export async function GET(_request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: {}
  });
  return NextResponse.json(response, { status: response.ok ? 200 : 404 });
}

export async function POST(request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const payload = await request.json().catch(() => undefined);
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: {},
    payload
  });
  return NextResponse.json(response, { status: response.ok ? 200 : 400 });
}
