import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../../lib/fluxiq";

type RouteParams = {
  params: Promise<{
    programId: string;
    endpoint: string;
  }>;
};

export async function GET(_request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const sessionId = await readSessionId();
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const url = new URL(_request.url);
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: { domainId: url.searchParams.get("domainId") }
  });
  return NextResponse.json(withWebRuntimeStatus(programId, endpoint, response), { status: response.ok ? 200 : 404 });
}

export async function POST(request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const sessionId = await readSessionId();
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const payload = await request.json().catch(() => undefined);
  const url = new URL(request.url);
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: { domainId: url.searchParams.get("domainId") },
    payload: (programId === "identity-access" || programId === "database-manager" || programId === "automation-studio") && payload && typeof payload === "object"
      ? { ...payload, authSessionId: sessionId }
      : payload
  });
  return NextResponse.json(withWebRuntimeStatus(programId, endpoint, response), { status: response.ok ? 200 : 400 });
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}

function withWebRuntimeStatus<TResponse extends { ok: boolean; payload?: unknown }>(programId: string, endpoint: string, response: TResponse): TResponse {
  if (programId !== "automation-studio" || endpoint !== "client-gateway-snapshot" || !response.ok || !response.payload || typeof response.payload !== "object") return response;
  return {
    ...response,
    payload: {
      ...response.payload,
      webRuntime: getFluxIQWebRuntimeStatus()
    }
  };
}
