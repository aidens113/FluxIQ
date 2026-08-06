import { NextResponse } from "next/server";
import { requireFluxIQUser } from "../../../lib/auth";
import { getFluxIQ } from "../../../lib/fluxiq";

export async function GET(request: Request) {
  const fluxiq = getFluxIQ();
  const authorized = await isAuthorized(request, fluxiq);
  if (!authorized) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });

  const url = new URL(request.url);
  const page = url.searchParams.get("page") ?? undefined;
  const pageSize = url.searchParams.get("pageSize") ?? undefined;
  const payload = await fluxiq.programs.automationStudio.listRecordingSummaries({ page, pageSize });
  return NextResponse.json(payload);
}

async function isAuthorized(request: Request, fluxiq: ReturnType<typeof getFluxIQ>): Promise<boolean> {
  const bearerToken = readBearerToken(request.headers.get("authorization"));
  if (bearerToken && await fluxiq.programs.clientGateway.authorizeToken(bearerToken)) return true;
  return Boolean(await requireFluxIQUser());
}

function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}
