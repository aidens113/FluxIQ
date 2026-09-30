import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { FLUXIQ_SESSION_COOKIE } from "../../../../../lib/auth";
import { getFluxIQ, getFluxIQWebRuntimeStatus } from "../../../../../lib/fluxiq";
import {
  isPairedClientClassification,
  isPairedClientEndpoint,
  narrowPairedClientRequest,
  pairedClientActor,
  pairedClientDomainScope,
  programDomainScope,
  programResponseStatus,
  projectPairedClientResponse,
  readBearerToken,
  withProgramAuthSession,
} from "../../../../../lib/program-route";

type RouteParams = {
  params: Promise<{
    programId: string;
    endpoint: string;
  }>;
};

type FluxIQ = ReturnType<typeof getFluxIQ>;
type ProgramCall = Parameters<FluxIQ["programs"]["api"]["call"]>[0];
type ProgramActor = NonNullable<ProgramCall["actor"]>;

/**
 * Who a request speaks for. The web panel's login cookie is the ordinary
 * caller; a paired client's bearer token is accepted only on the endpoints
 * `lib/program-route.ts` allowlists, and never alongside a valid cookie.
 */
type RouteCaller =
  | { kind: "person"; sessionId: string; userId: string; actor: ProgramActor; scope: ProgramCall["scope"] }
  | { kind: "paired-client"; actor: ProgramActor; scope: ProgramCall["scope"] };

export async function GET(request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const caller = await authenticate(request, fluxiq, programId, endpoint);
  if (caller instanceof NextResponse) return caller;
  const narrowed = caller.kind === "paired-client" ? narrowPairedClientRequest(programId, endpoint, undefined) : { ok: true as const, payload: undefined };
  if (!narrowed.ok) return refuse(403, narrowed.error, narrowed.errorCode);
  const response = await fluxiq.programs.api.call({ programId, endpoint, scope: caller.scope, actor: caller.actor, ...(narrowed.payload !== undefined ? { payload: narrowed.payload } : {}) });
  return respond(programId, endpoint, response, caller);
}

export async function POST(request: Request, context: RouteParams) {
  const { programId, endpoint } = await context.params;
  const fluxiq = getFluxIQ();
  const caller = await authenticate(request, fluxiq, programId, endpoint);
  if (caller instanceof NextResponse) return caller;
  const payload = await request.json().catch(() => undefined);
  // A token call's body is narrowed before any handler sees it: a field that
  // would reach an LLM, an inline Flow or another reviewer is refused by name.
  const narrowed = caller.kind === "person" ? { ok: true as const, payload: withProgramAuthSession(programId, payload, caller.sessionId) } : narrowPairedClientRequest(programId, endpoint, withoutAuthSession(payload));
  if (!narrowed.ok) return refuse(403, narrowed.error, narrowed.errorCode);
  const response = await fluxiq.programs.api.call({
    programId,
    endpoint,
    scope: caller.scope,
    actor: caller.actor,
    payload: narrowed.payload,
  });
  return respond(programId, endpoint, response, caller);
}

async function authenticate(request: Request, fluxiq: FluxIQ, programId: string, endpoint: string): Promise<RouteCaller | NextResponse> {
  const sessionId = await readSessionId();
  const auth = sessionId ? await fluxiq.programs.identityAccess.validateSession(sessionId) : null;
  if (sessionId && auth) {
    return {
      kind: "person",
      sessionId,
      userId: auth.user.id,
      actor: { sessionId, userId: auth.user.id, roleId: auth.role.id, permissions: auth.role.permissions },
      scope: programDomainScope(request.url),
    };
  }
  const token = readBearerToken(request.headers.get("authorization"));
  if (!token) return refuse(401, "Authentication required");
  return authenticatePairedClient(request, fluxiq, token, programId, endpoint);
}

// A paired client's token. The endpoint is checked by name before the token is
// looked at, so a token on an endpoint it may never call learns nothing about
// whether it is valid.
async function authenticatePairedClient(request: Request, fluxiq: FluxIQ, token: string, programId: string, endpoint: string): Promise<RouteCaller | NextResponse> {
  const notAvailable = "This endpoint is not available to a paired client.";
  if (!isPairedClientEndpoint(programId, endpoint)) return refuse(403, notAvailable);
  const classification = fluxiq.programs.api.endpoints().find((entry) => entry.programId === programId && entry.endpoint === endpoint)?.classification;
  if (!isPairedClientClassification(classification)) return refuse(403, notAvailable);
  const session = await fluxiq.programs.clientGateway.authorizeToken(token);
  if (!session) return refuse(401, "Authentication required");
  const actor = pairedClientActor<ProgramActor["permissions"][number]>(session, await fluxiq.programs.identityAccess.snapshot());
  if (!actor) return refuse(401, "Authentication required");
  const scope = pairedClientDomainScope(request.url, session);
  if (!scope) return refuse(403, "A paired client may only reach its own domain.");
  return { kind: "paired-client", actor, scope };
}

/** A token caller's payload, with any auth session it tried to name removed: only a signed-in person's cookie supplies one. */
function withoutAuthSession(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("authSessionId" in payload)) return payload;
  const { authSessionId: _authSessionId, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function respond(programId: string, endpoint: string, response: Awaited<ReturnType<FluxIQ["programs"]["api"]["call"]>>, caller: RouteCaller) {
  const body = caller.kind === "person" ? withWebRuntimeStatus(programId, endpoint, response, caller.userId) : projectPairedClientResponse(programId, endpoint, response);
  return NextResponse.json(body, { status: programResponseStatus(response) });
}

function refuse(status: 401 | 403, error: string, errorCode?: "authorization.forbidden") {
  return NextResponse.json({ ok: false, error, ...(errorCode ? { errorCode } : {}) }, { status });
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
