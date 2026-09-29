const SESSION_BOUND_PROGRAMS = new Set(["identity-access", "database-manager", "automation-studio", "secret-keys"]);

export function programResponseStatus(response: { ok: boolean; errorCode?: string }): number {
  if (response.ok) return 200;
  if (response.errorCode === "authorization.required") return 401;
  if (response.errorCode === "authorization.forbidden") return 403;
  if (response.errorCode === "endpoint.not_found") return 404;
  return 400;
}

export function programDomainScope(requestUrl: string): { domainId: string | null } {
  return { domainId: new URL(requestUrl).searchParams.get("domainId") };
}

export function withProgramAuthSession(programId: string, payload: unknown, sessionId: string): unknown {
  if (!SESSION_BOUND_PROGRAMS.has(programId) || !payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  return { ...payload, authSessionId: sessionId };
}

// A paired client's bearer token on the program route.
//
// The web panel reaches program endpoints with its login cookie. A paired
// browser extension has no cookie: it holds the client-gateway token the
// person approved when they paired it, the same token `/api/recordings`
// already accepts. The extension's panel needs a handful of endpoints to talk
// to FluxIQ and to stop a run, so exactly those accept the token, acting as the
// person who approved the pairing. Every other endpoint still requires the
// cookie, and a token on one of them is refused rather than ignored.
//
// Four rules keep the token from being more than that:
//
// - **An allowlist, not a classification.** The endpoints are named below. A
//   new endpoint is unreachable by token until someone adds it here, next to
//   this comment.
// - **Nothing destructive, ever.** The route also refuses a token call to any
//   endpoint the registry classifies as other than `read` or `authoring`, so an
//   entry added here by mistake still cannot reach a delete, a payment or a
//   program-gated credential check. Deleting and moving money keep asking the
//   person, and the token is never a way round that. Answering an ask is
//   `authoring`: it is how a person answers a question in their own thread, and
//   the act it answers is still gated where it happens.
// - **Only the permissions these endpoints need.** The actor carries the
//   approving person's role permissions intersected with the three the
//   allowlist uses, so a token never holds `identity.manage` or `data.manage`,
//   whatever the person's role.
// - **The session's own domain.** A paired client is scoped to the domain it
//   declared when it connected. A request whose URL names a different domain is
//   refused, so a web-automation client cannot point itself at another
//   domain's projects.
//
// No auth session is injected into a token call's payload: the gateway session
// is not an identity session, so a PIN check a handler runs against it fails
// closed. The token is never logged, never echoed and never used as an
// identifier; the actor's session id names the gateway session instead.

/** The program endpoints a paired client's bearer token may call, by program. */
export const PAIRED_CLIENT_ENDPOINTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "automation-studio": Object.freeze([
    "list-conversations",
    "open-conversation",
    "get-conversation",
    "append-turn",
    "answer-ask",
    "list-runtime-sessions",
    "cancel-runtime-session",
  ]),
});

/** The permissions a paired client's actor may hold: exactly those the allowlisted endpoints require. */
const PAIRED_CLIENT_PERMISSIONS: readonly string[] = ["programs.read", "programs.write", "runtime.control"];

/** The registry classifications a token call may reach. Anything destructive or credential-gated is refused. */
const PAIRED_CLIENT_CLASSIFICATIONS: readonly string[] = ["read", "authoring"];

/** Whether a paired client's token may name this endpoint at all. */
export function isPairedClientEndpoint(programId: string, endpoint: string): boolean {
  const allowed = PAIRED_CLIENT_ENDPOINTS[programId.trim().toLowerCase()];
  return allowed?.includes(endpoint.trim().toLowerCase()) === true;
}

/** Whether the registry's classification of an allowlisted endpoint is one a token may reach. Unknown is refused. */
export function isPairedClientClassification(classification: string | undefined): boolean {
  return classification !== undefined && PAIRED_CLIENT_CLASSIFICATIONS.includes(classification);
}

/** The token from an `Authorization: Bearer <token>` header, or null. */
export function readBearerToken(header: string | null): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1]?.trim() || null;
}

type PairedSession = {
  sessionId: string;
  operatorUserId?: string;
  metadata?: Record<string, unknown>;
};

type IdentityDirectory = {
  users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
  roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
};

type PairedClientActor<TPermission extends string> = {
  sessionId: string;
  userId: string;
  roleId: string;
  permissions: TPermission[];
};

/**
 * The actor a paired client's call runs as: the person who approved the
 * pairing, with their role's permissions narrowed to the allowlist's. Null when
 * that person is gone, disabled or roleless, so disabling a person takes their
 * paired clients' reach with them.
 */
export function pairedClientActor<TPermission extends string>(session: PairedSession, directory: IdentityDirectory): PairedClientActor<TPermission> | null {
  const userId = session.operatorUserId;
  if (!userId) return null;
  const user = directory.users.find((candidate) => candidate.id === userId);
  if (!user?.enabled) return null;
  const role = directory.roles.find((candidate) => candidate.id === user.roleId);
  if (!role) return null;
  const permissions = role.permissions.filter((permission) => PAIRED_CLIENT_PERMISSIONS.includes(permission)) as TPermission[];
  return { sessionId: `client-gateway:${session.sessionId}`, userId, roleId: role.id, permissions };
}

/**
 * The domain a paired client's call is scoped to: the one its session declared
 * when it connected. Undefined when the URL names a different one, which the
 * route refuses.
 */
export function pairedClientDomainScope(requestUrl: string, session: PairedSession): { domainId: string | null } | undefined {
  const declared = session.metadata?.domainId;
  const domainId = typeof declared === "string" && declared.trim() ? declared.trim() : null;
  const requested = programDomainScope(requestUrl).domainId;
  if (requested !== null && requested !== domainId) return undefined;
  return { domainId };
}
