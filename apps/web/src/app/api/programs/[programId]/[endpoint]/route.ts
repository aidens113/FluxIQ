import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../../lib/fluxiq";
import { programDomainScope, programResponseStatus, withProgramAuthSession } from "../../../../../lib/program-route";

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
  if (!sessionId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: programDomainScope(_request.url),
    actor: programApiActor(sessionId, auth),
  });
  return NextResponse.json(withWebRuntimeStatus(programId, endpoint, response, auth.user.id), { status: programResponseStatus(response) });
}

export async function POST(request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const sessionId = await readSessionId();
  if (!sessionId) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const auth = await fluxiq.programs.identityAccess.validateSession(sessionId);
  if (!auth) return NextResponse.json({ ok: false, error: "Authentication required" }, { status: 401 });
  const payload = await request.json().catch(() => undefined);
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: programDomainScope(request.url),
    actor: programApiActor(sessionId, auth),
    payload: withProgramAuthSession(programId, payload, sessionId),
  });
  return NextResponse.json(withWebRuntimeStatus(programId, endpoint, response, auth.user.id), { status: programResponseStatus(response) });
}

function programApiActor(
  sessionId: string,
  auth: NonNullable<Awaited<ReturnType<ReturnType<typeof getFluxIQ>["programs"]["identityAccess"]["validateSession"]>>>,
) {
  return {
    sessionId,
    userId: auth.user.id,
    roleId: auth.role.id,
    permissions: auth.role.permissions,
  };
}

async function readSessionId(): Promise<string | undefined> {
  const cookieStore = await cookies();
  return cookieStore.get(FLUXIQ_SESSION_COOKIE)?.value;
}

function withWebRuntimeStatus<TResponse extends { ok: boolean; payload?: unknown }>(
  programId: string,
  endpoint: string,
  response: TResponse,
  operatorUserId: string,
): TResponse {
  if (programId !== "automation-studio" || endpoint !== "client-gateway-snapshot" || !response.ok || !response.payload || typeof response.payload !== "object")
    return response;
  return {
    ...response,
    payload: {
      ...response.payload,
      webRuntime: getFluxIQWebRuntimeStatus(operatorUserId),
    },
  };
}
