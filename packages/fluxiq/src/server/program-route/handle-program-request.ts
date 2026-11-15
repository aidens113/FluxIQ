import type { FluxIQ } from "../../framework/index.ts";
import type { ClientGatewaySession } from "../../client-gateway/index.ts";
import { programDrainRefusal } from "../drain/index.ts";
import { pairedClientProjectDomainRefusal, type PairedClientProjectDomainRefusal } from "./paired-client-project-domain.ts";
import { presentPanelSession } from "./present-panel-session.ts";
import { managedClientAuthority } from "../managed-hosts/index.ts";
import { programJsonText } from "./program-json-text.ts";
import type { ProgramRouteIdentityAuthority } from "./identity-authority.ts";
import {
  isPairedClientClassification,
  isPairedClientEndpoint,
  narrowPairedClientRequest,
  pairedClientActor,
  pairedClientDomainScope,
  pairedClientProjectTarget,
  programDomainScope,
  programResponseStatus,
  projectPairedClientResponse,
  readBearerToken,
  withProgramAuthSession,
} from "./program-route.ts";

type ProgramCall = Parameters<FluxIQ["programs"]["api"]["call"]>[0];
type ProgramActor = NonNullable<ProgramCall["actor"]>;
type ProgramCallResponse = Awaited<ReturnType<FluxIQ["programs"]["api"]["call"]>>;

/** One call of `/api/programs/<programId>/<endpoint>`, as whichever server received it read it. */
export type ProgramRouteRequest = {
  method: "GET" | "POST";
  /** The request's absolute URL; its `domainId` query names the domain. */
  url: string;
  programId: string;
  endpoint: string;
  /** The panel session cookie's value, when the server reads one. */
  sessionId: string | undefined;
  /** The `Authorization` header, or null. */
  authorization: string | null;
  /** The body as JSON, read only for a POST and only once the caller is known; undefined when it does not parse. */
  readJson(): Promise<unknown>;
};

/** What the route answers with, for the server to write as it is. */
export type ProgramRouteResponse = { status: number; headers: Record<string, string>; body: string };

export type ProgramRouteContext = {
  fluxiq: FluxIQ;
  /** Trusted server authority for identities; defaults to this instance for single-root hosts. */
  identityAuthority?: ProgramRouteIdentityAuthority;
  /** Trusted selected-workspace binding guard; absent keeps the local/single-instance path unchanged. */
  revalidateAuthority?: () => Promise<boolean>;
  /**
   * What the web panel adds to `client-gateway-snapshot` for a signed-in
   * person (its runtime's status). A server with no panel leaves it out and
   * the snapshot is answered as the endpoint returns it.
   */
  webRuntimeStatus?: (operatorUserId: string) => unknown;
};

/**
 * Who a request speaks for. The web panel's login cookie is the ordinary
 * caller; a paired client's bearer token is accepted only on the endpoints
 * `program-route.ts` allowlists, and never alongside a valid cookie. Each
 * actor names its channel (`panel`, `paired-client`), and the registry's
 * `call` decides the endpoint through IAM by its registration's own action,
 * permission and resources (`APP_ROUTES_DECIDED_BY_REGISTRY`).
 */
type RouteCaller =
  | { kind: "person"; sessionId: string; userId: string; actor: ProgramActor; scope: ProgramCall["scope"] }
  | { kind: "paired-client"; actor: ProgramActor; scope: ProgramCall["scope"]; currentProjectId: string | null | undefined; binding: PairedCallerBinding; managed?: NonNullable<ReturnType<typeof managedClientAuthority>> };

type PairedCallerBinding = {
  trustedClientId: string | undefined;
  clientId: string;
  clientType: ClientGatewaySession["clientType"];
  managedHostId: string | undefined;
};

/**
 * The program route: authenticate, refuse while draining, narrow a token
 * call's body, gate its project's domain, call the endpoint and shape the
 * answer. Moved from the web panel's `app/api/programs/[programId]/[endpoint]/route.ts`
 * so the panel and a server without Next.js mount the same handler.
 */
export async function handleProgramRequest(request: ProgramRouteRequest, context: ProgramRouteContext): Promise<ProgramRouteResponse> {
  const { programId, endpoint } = request;
  const { fluxiq } = context;
  const identityAuthority = context.identityAuthority ?? fluxiq.programs.identityAccess;
  const guard = context.revalidateAuthority;
  const caller = guard
    ? await guardedAuthenticate(request, fluxiq, identityAuthority, guard)
    : await authenticate(request, fluxiq, identityAuthority);
  if ("status" in caller) return caller;
  const draining = refuseWhileDraining(programId, endpoint);
  if (draining) return draining;
  const narrowed = request.method === "GET" ? narrowGet(programId, endpoint, caller) : await narrowPost(request, caller);
  if (!narrowed.ok) return refuse(403, narrowed.error, narrowed.errorCode);
  if (caller.kind === "paired-client" && caller.managed) {
    const payload = narrowed.payload;
    if (payload !== undefined && (payload === null || typeof payload !== "object" || Array.isArray(payload) || Object.keys(payload).some((key) => key !== "projectId"))) return refuse(403, "A managed host's policy read may name only its leased project.");
    narrowed.payload = { projectId: caller.managed.projectId, ...(payload as object | undefined) };
  }
  const outside = caller.kind === "paired-client" ? await refuseProjectOutsideDomain(fluxiq, programId, caller, narrowed.payload) : null;
  if (outside) return outside;
  if (caller.kind === "paired-client" && caller.managed && !caller.managed.isCurrent()) return refuse(403, "The managed host's run lease is no longer current.");
  let dispatchCaller = caller;
  if (guard) {
    // Authentication is refreshed only within the originally chosen channel: revocation cannot switch a cookie to a bearer, or vice versa.
    const current = await guardedAuthenticate(request, fluxiq, identityAuthority, guard, caller.kind);
    if ("status" in current) return current;
    if (!sameCallerBinding(caller, current)) return refuse(401, "Authentication required");
    const authorityRefusal = await checkAuthorityGuard(guard);
    if (authorityRefusal) return authorityRefusal;
    // The original predicate captures the original run/lease epoch, even when a refresh sees the same host on a new run.
    if (caller.kind === "paired-client" && caller.managed && !caller.managed.isCurrent()) return refuse(403, "The managed host's run lease is no longer current.");
    if (current.kind === "paired-client" && current.managed && !current.managed.isCurrent()) return refuse(403, "The managed host's run lease is no longer current.");
    dispatchCaller = current;
  }
  const response = request.method === "GET"
    ? await fluxiq.programs.api.call({ programId, endpoint, scope: dispatchCaller.scope, actor: dispatchCaller.actor, ...(narrowed.payload !== undefined ? { payload: narrowed.payload } : {}) })
    : await fluxiq.programs.api.call({ programId, endpoint, scope: dispatchCaller.scope, actor: dispatchCaller.actor, payload: narrowed.payload });
  return respond(programId, endpoint, response, dispatchCaller, context);
}

type Narrowed = { ok: true; payload: unknown } | { ok: false; errorCode: "authorization.forbidden"; error: string };

function narrowGet(programId: string, endpoint: string, caller: RouteCaller): Narrowed {
  return caller.kind === "paired-client" ? narrowPairedClientRequest(programId, endpoint, undefined) : { ok: true, payload: undefined };
}

// A token call's body is narrowed before any handler sees it: a field that
// would reach an LLM, an inline Flow or another reviewer is refused by name.
async function narrowPost(request: ProgramRouteRequest, caller: RouteCaller): Promise<Narrowed> {
  const payload = await request.readJson();
  return caller.kind === "person"
    ? { ok: true, payload: withProgramAuthSession(request.programId, payload, caller.sessionId) }
    : narrowPairedClientRequest(request.programId, request.endpoint, withoutAuthSession(payload));
}

async function authenticate(request: ProgramRouteRequest, fluxiq: FluxIQ, identityAuthority: ProgramRouteIdentityAuthority, guard?: () => Promise<boolean>, channel?: RouteCaller["kind"]): Promise<RouteCaller | ProgramRouteResponse> {
  const sessionId = channel === "paired-client" ? undefined : request.sessionId;
  const auth = sessionId ? await identityAuthority.validateSession(sessionId) : null;
  if (sessionId && auth) {
    if (guard) {
      const refusal = await checkAuthorityGuard(guard);
      if (refusal) return refusal;
    }
    // Refresh reads authority only; a changed caller must not open another key holder before binding comparison.
    if (channel === undefined) await presentPanelSession(fluxiq, sessionId, auth);
    return {
      kind: "person",
      sessionId,
      userId: auth.user.id,
      actor: { sessionId, userId: auth.user.id, roleId: auth.role.id, permissions: auth.role.permissions, channel: "panel" },
      scope: programDomainScope(request.url),
    };
  }
  if (channel === "person") return refuse(401, "Authentication required");
  const token = readBearerToken(request.authorization);
  if (!token) return refuse(401, "Authentication required");
  return authenticatePairedClient(request, fluxiq, identityAuthority, token, guard);
}

// A paired client's token. The endpoint is checked by name before the token is
// looked at, so a token on an endpoint it may never call learns nothing about
// whether it is valid.
async function authenticatePairedClient(request: ProgramRouteRequest, fluxiq: FluxIQ, identityAuthority: ProgramRouteIdentityAuthority, token: string, guard?: () => Promise<boolean>): Promise<RouteCaller | ProgramRouteResponse> {
  const { programId, endpoint } = request;
  const notAvailable = "This endpoint is not available to a paired client.";
  if (!isPairedClientEndpoint(programId, endpoint)) return refuse(403, notAvailable);
  const classification = fluxiq.programs.api.endpoints().find((entry) => entry.programId === programId && entry.endpoint === endpoint)?.classification;
  if (!isPairedClientClassification(classification)) return refuse(403, notAvailable);
  if (guard) {
    const refusal = await checkAuthorityGuard(guard);
    if (refusal) return refusal;
  }
  const session = await fluxiq.programs.clientGateway.authorizeToken(token);
  if (!session) return refuse(401, "Authentication required");
  const binding: PairedCallerBinding = { trustedClientId: session.trustedClientId, clientId: session.clientId, clientType: session.clientType, managedHostId: session.managedHostId };
  if (session.managedHostId !== undefined) {
    const managed = managedClientAuthority(fluxiq, session);
    if (!managed || programId !== "automation-studio" || endpoint !== "get-recording-capture-policy") return refuse(403, "This endpoint is not available to this managed host's run.");
    const scope = pairedClientDomainScope(request.url, session);
    return scope ? { kind: "paired-client", actor: managed.actor, scope, currentProjectId: managed.projectId, binding, managed } : refuse(403, "A managed host may only reach its own domain.");
  }
  const actor = pairedClientActor<ProgramActor["permissions"][number]>(session, await identityAuthority.snapshot());
  if (!actor) return refuse(401, "Authentication required");
  const scope = pairedClientDomainScope(request.url, session);
  if (!scope) return refuse(403, "A paired client may only reach its own domain.");
  return { kind: "paired-client", actor, scope, currentProjectId: session.projectId, binding };
}

async function guardedAuthenticate(request: ProgramRouteRequest, fluxiq: FluxIQ, identityAuthority: ProgramRouteIdentityAuthority, guard?: () => Promise<boolean>, channel?: RouteCaller["kind"]): Promise<RouteCaller | ProgramRouteResponse> {
  try {
    return await authenticate(request, fluxiq, identityAuthority, guard, channel);
  } catch (error) {
    return authorityUnavailable(error);
  }
}

async function checkAuthorityGuard(guard: () => Promise<boolean>): Promise<ProgramRouteResponse | null> {
  try {
    return await guard() === true ? null : refuse(401, "Authentication required");
  } catch (error) {
    return authorityUnavailable(error);
  }
}

function authorityUnavailable(error: unknown): ProgramRouteResponse {
  // A credential or tenant lookup can put private state in an exception; never return or log its text.
  console.warn("[FluxIQ] Program request authority could not be verified.", { failureKind: error instanceof Error ? "error" : "rejection" });
  return json(503, JSON.stringify({ ok: false, error: "Request authority could not be verified." }));
}

function sameCallerBinding(first: RouteCaller, current: RouteCaller): boolean {
  if (first.kind !== current.kind || first.actor.userId !== current.actor.userId || first.actor.sessionId !== current.actor.sessionId || (first.scope?.domainId ?? null) !== (current.scope?.domainId ?? null)) return false;
  if (first.kind === "person") return current.kind === "person" && first.sessionId === current.sessionId && first.userId === current.userId;
  if (current.kind !== "paired-client" || (first.currentProjectId ?? null) !== (current.currentProjectId ?? null)) return false;
  for (const key of ["trustedClientId", "clientId", "clientType", "managedHostId"] as const) {
    if (first.binding[key] !== current.binding[key]) return false;
  }
  return Boolean(first.managed) === Boolean(current.managed)
    && first.managed?.projectId === current.managed?.projectId
    && first.managed?.domainId === current.managed?.domainId;
}

// The domain gate (t379). Every token call reaches its project -- the one its
// body names, or the session's current one -- only when that project's domain
// is the one the pairing bound, which `authorizeToken` guarantees is the
// session's declared domain. Here rather than in each handler, so no handler
// has to remember. A project that does not exist is refused the same way, so
// the answer does not say which ids exist elsewhere. The refusal carries
// `authorization.project_domain` and a sentence the person can act on
// (`paired-client-project-domain.ts`), so a client can show it rather than
// treat it as a refused token.
async function refuseProjectOutsideDomain(
  fluxiq: FluxIQ,
  programId: string,
  caller: Extract<RouteCaller, { kind: "paired-client" }>,
  payload: unknown,
): Promise<ProgramRouteResponse | null> {
  const target = pairedClientProjectTarget(programId, payload, caller.currentProjectId);
  if (!target.ok) return refuse(403, target.error, target.errorCode);
  if (target.projectId === null) return null;
  if (caller.managed && target.projectId !== caller.managed.projectId) return refuse(403, "A managed host may only reach its leased run's project.");
  const refusal = await pairedClientProjectDomainRefusal(fluxiq.programs.automationStudio, target.projectId, caller.scope.domainId ?? null);
  return refusal ? refuse(403, refusal.error, refusal.errorCode) : null;
}

/** A token caller's payload, with any auth session it tried to name removed: only a signed-in person's cookie supplies one. */
function withoutAuthSession(payload: unknown): unknown {
  if (!payload || typeof payload !== "object" || Array.isArray(payload) || !("authSessionId" in payload)) return payload;
  const { authSessionId: _authSessionId, ...rest } = payload as Record<string, unknown>;
  return rest;
}

function respond(programId: string, endpoint: string, response: ProgramCallResponse, caller: RouteCaller, context: ProgramRouteContext): ProgramRouteResponse {
  const body = caller.kind === "person" ? withWebRuntimeStatus(programId, endpoint, response, caller.userId, context) : projectPairedClientResponse(programId, endpoint, response);
  const written = programJsonText(programId, endpoint, body, programResponseStatus(response));
  return json(written.status, written.text);
}

function refuse(status: 401 | 403, error: string, errorCode?: "authorization.forbidden" | PairedClientProjectDomainRefusal["errorCode"]): ProgramRouteResponse {
  return json(status, JSON.stringify({ ok: false, error, ...(errorCode ? { errorCode } : {}) }));
}

function withWebRuntimeStatus<TResponse extends { ok: boolean; payload?: unknown }>(
  programId: string,
  endpoint: string,
  response: TResponse,
  operatorUserId: string,
  context: ProgramRouteContext,
): TResponse {
  if (!context.webRuntimeStatus) return response;
  if (programId !== "automation-studio" || endpoint !== "client-gateway-snapshot" || !response.ok || !response.payload || typeof response.payload !== "object")
    return response;
  return {
    ...response,
    payload: {
      ...response.payload,
      webRuntime: context.webRuntimeStatus(operatorUserId),
    },
  };
}

// While the server drains, a call that would start a build or run is refused
// before its handler can have any effect; reads and stops still go through.
function refuseWhileDraining(programId: string, endpoint: string): ProgramRouteResponse | null {
  const refusal = programDrainRefusal(programId, endpoint);
  if (!refusal) return null;
  return json(refusal.status, JSON.stringify(refusal.body), { "Retry-After": String(refusal.retryAfterSeconds) });
}

function json(status: number, body: string, headers: Record<string, string> = {}): ProgramRouteResponse {
  return { status, headers: { "content-type": "application/json", ...headers }, body };
}
