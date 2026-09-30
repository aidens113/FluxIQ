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
// to FluxIQ, to stop a run, and for Simple Mode to run a saved Flow, read its
// history and turn a recording into one, so exactly those accept the token, acting as the
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
//   approving person's role permissions intersected with the four the
//   allowlist uses, so a token never holds `identity.manage` or `data.manage`,
//   whatever the person's role. Where an allowlisted endpoint's body could
//   still reach further -- an LLM, an inline Flow, a side-effect authorization,
//   another reviewer -- `narrowPairedClientRequest` refuses that field, and
//   where its answer holds more than a token should read,
//   `projectPairedClientResponse` cuts it down.
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
    // Simple Mode's Flow picker, `read`.
    "list-flow-summaries",
    // Simple Mode's run history for a Flow, `read`.
    "list-flow-runs",
    // Opening one run from that history, `read`.
    "get-flow-run-detail",
    // Showing what a run learned, `read`; reviewing an adaptation stays cookie-only.
    "list-flow-adaptations",
    // Downloading a run's captured rows, `read`. No stored row holds an encrypted field: the store refuses an `encrypt` schema until record keys exist (K11).
    "export-run-dataset",
    // Running a saved Flow, `authoring`. Narrowed: a stored Flow by id, with no LLM, no inputs and no side-effect authorization.
    "run-runtime-session",
    // Turning a finished recording into a Flow proposal, `authoring`. Narrowed: the direct mapper only, never the LLM-assisted one.
    "generate-recording-proposal",
    // Accepting that proposal as a Flow, `authoring`. Narrowed: approve only, as the paired person, with no policy override or destination.
    "review-recording-flow-proposal",
    // Undoing one captured step while the recording is still open, `authoring`; a finalized recording refuses it.
    "remove-recording-entry",
  ]),
  "secret-keys": Object.freeze([
    // Whether an LLM key is configured, `read`. Projected: kind, provider and enabled only, nothing that names or identifies a key.
    "snapshot",
  ]),
});

/**
 * The permissions a paired client's actor may hold: exactly those the
 * allowlisted endpoints require. `flows.write` is here only because
 * `generate-recording-proposal` and `review-recording-flow-proposal` require
 * it; no other `flows.write` endpoint is on the allowlist.
 */
const PAIRED_CLIENT_PERMISSIONS: readonly string[] = ["programs.read", "programs.write", "runtime.control", "flows.write"];

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

/** A token call's payload after narrowing, or the refusal that names the field it may not carry. */
export type PairedClientRequestNarrowing =
  | { ok: true; payload: unknown }
  | { ok: false; errorCode: "authorization.forbidden"; error: string };

/**
 * The run modes a token may ask for. Absent, `default`, `fully_adaptive` and
 * `manual_approval` all let the run invoke an LLM for diagnosis
 * (`normalizeAutomationStudioRuntimeInterventionMode` reads absent and
 * `default` as `fully_adaptive`, and `runtimeAdaptationContextWithRunOverride`
 * turns `invokeLlm` off only for `no_llm_intervention`), so a token's run with
 * no mode is pinned to `no_llm_intervention` and any other mode is refused.
 */
const PAIRED_CLIENT_RUN_MODES: readonly string[] = ["no_llm_intervention", "deterministic"];

/**
 * What a paired client may put in the request body of an endpoint whose
 * handler would otherwise let it reach further than the allowlist means. The
 * rule is least privilege: no token call carries an LLM grant or reaches an
 * LLM, runs an inline Flow document, authorizes an external side effect, or
 * speaks for a reviewer other than the person the actor already is. A refused
 * field is named, never its value. Endpoints not listed here pass unchanged.
 */
export function narrowPairedClientRequest(programId: string, endpoint: string, payload: unknown): PairedClientRequestNarrowing {
  const program = programId.trim().toLowerCase();
  const name = endpoint.trim().toLowerCase();
  if (program !== "automation-studio") return { ok: true, payload };
  if (name === "run-runtime-session") return narrowRunRuntimeSession(payload);
  if (name === "generate-recording-proposal") return narrowGenerateRecordingProposal(payload);
  if (name === "review-recording-flow-proposal") return narrowReviewRecordingFlowProposal(payload);
  return { ok: true, payload };
}

function narrowRunRuntimeSession(payload: unknown): PairedClientRequestNarrowing {
  const body = payloadRecord(payload);
  if (!body || typeof body.flowId !== "string" || !body.flowId.trim()) return forbidden("A paired client's run must name a saved Flow by a string flowId.");
  for (const field of ["flow", "runIntent", "permittedConsequences", "dryRunLlm", "useReusableContext", "inputs"] as const) {
    if (field in body) return forbidden(`A paired client's run may not carry ${field}.`);
  }
  if ("authorizedExternalSideEffects" in body && body.authorizedExternalSideEffects !== false) {
    return forbidden("A paired client's run may not carry authorizedExternalSideEffects.");
  }
  if (body.adaptiveMode === undefined) return { ok: true, payload: { ...body, adaptiveMode: "no_llm_intervention" } };
  if (typeof body.adaptiveMode !== "string" || !PAIRED_CLIENT_RUN_MODES.includes(body.adaptiveMode)) {
    return forbidden("A paired client's run may not carry an adaptiveMode that lets it invoke an LLM.");
  }
  return { ok: true, payload: body };
}

function narrowGenerateRecordingProposal(payload: unknown): PairedClientRequestNarrowing {
  const body = payloadRecord(payload) ?? {};
  if (body.mode === "llm_assisted") return forbidden("A paired client's proposal may not carry mode llm_assisted.");
  for (const field of ["instructions", "constraints"] as const) {
    if (field in body) return forbidden(`A paired client's proposal may not carry ${field}.`);
  }
  return { ok: true, payload };
}

function narrowReviewRecordingFlowProposal(payload: unknown): PairedClientRequestNarrowing {
  const body = payloadRecord(payload) ?? {};
  // `destination` names where the approved Flow is written, which can be over
  // an existing one; the panel saves a new automation, so a token never names it.
  for (const field of ["policyOverride", "reviewerId", "destination"] as const) {
    if (field in body) return forbidden(`A paired client's review may not carry ${field}.`);
  }
  if ("decision" in body && body.decision !== "approved") return forbidden("A paired client's review may only carry decision approved.");
  return { ok: true, payload };
}

function payloadRecord(payload: unknown): Record<string, unknown> | null {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : null;
}

function forbidden(error: string): PairedClientRequestNarrowing {
  return { ok: false, errorCode: "authorization.forbidden", error };
}

/**
 * What a paired client is answered, where the endpoint's full answer holds
 * more than a token should read. The secret-keys snapshot is cut to whether a
 * key of each kind and provider exists and is enabled: never its id, name,
 * scope, description, dates or metadata (where a fingerprint or hint would
 * live), and never a value, which the snapshot does not hold either. Every
 * other answer passes unchanged.
 */
export function projectPairedClientResponse<TResponse extends { ok: boolean; payload?: unknown }>(programId: string, endpoint: string, response: TResponse): TResponse {
  if (programId.trim().toLowerCase() !== "secret-keys" || endpoint.trim().toLowerCase() !== "snapshot" || !response.ok) return response;
  const keys = payloadRecord(response.payload)?.keys;
  return {
    ...response,
    payload: {
      keys: Array.isArray(keys)
        ? keys.map((key) => {
          const summary = payloadRecord(key) ?? {};
          return {
            kind: typeof summary.kind === "string" ? summary.kind : null,
            provider: typeof summary.provider === "string" ? summary.provider : null,
            enabled: summary.enabled === true,
          };
        })
        : [],
    },
  };
}
