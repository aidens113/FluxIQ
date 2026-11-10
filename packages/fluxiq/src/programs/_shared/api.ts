import { iamActionName } from "@fluxiq/contracts/iam";
import { iamEndpointAccessLevel, iamProgramService } from "../../platform/iam/catalog/index.ts";
import type { IamRequestConsent, IamRequestVia, IamResource } from "../../platform/iam/index.ts";
import type { IdentityAccessService } from "../identity-access/index.ts";
import type { Permission } from "../identity-access/types.ts";
import { assistantDeclarationProblem, assistantTargetProblem, type ProgramEndpointAssistant } from "./assistant/index.ts";
import { GLOBAL_PROGRAMS } from "./catalog.ts";
import { confirmDestructiveCall, payloadAsSent, payloadCarriesPin, personPressRefusal, pressGrantConsent, PRESS_GRANT_REFUSALS, PressGrantStore, type PressGrantMinted, type PressGrantMintRequest } from "./press-grant/index.ts";
import { recordProgramEndpointPerformance, serializedMetricBytes, withEndpointPerformanceScope } from "../../framework/persistence/performance-metrics/performance-metrics.ts";
import type { ProgramScope } from "./types.ts";
import {
  filterProgramList,
  programForbiddenResponse,
  ProgramIamGate,
  recordProgramCreatedOwner,
  type ProgramApiAuthorization,
  type ProgramApiAuthorizeInput,
  type ProgramApiIamOptions,
  type ProgramEndpointIamDeclaration,
  type ProgramIamRegisteredAction,
  type ProgramIamRequest,
  type ProgramOwnedResourceKind,
  type ProgramResourceRef
} from "./iam/index.ts";
import type { ProgramResourceOwnerResolver } from "../../framework/persistence/resource-owner/owner-resolver.ts";

/**
 * What an endpoint does to persisted state, and therefore which credential the
 * registry requires beyond the endpoint's permission. Every registration
 * declares one, so a new endpoint cannot reach the wire unclassified: omitting
 * the field is a compile error, not a review note.
 *
 * - `read` — persists nothing. The permission is the whole gate.
 * - `authoring` — creates or edits user content, or withdraws access without
 *   removing persisted data. The permission is the whole gate: the operator's
 *   PIN guards destruction, not authorship, so an autonomous loop can build and
 *   edit Flows with nobody at the keyboard, and revoking a compromised session
 *   or client never waits behind a prompt.
 * - `destructive` — removes persisted user data, or takes an irreversible
 *   external action. `call()` requires a confirmation before the handler runs
 *   (`confirmDestructiveCall`): the person's PIN where they turned one on,
 *   otherwise a press grant their own press of Delete or Allow minted.
 * - `program-gated` — the owning program runs its own, stronger credential
 *   check inside the handler (password, PIN and TOTP, or a time-boxed grant).
 *   The registry adds nothing, so that one regime stays the single rule.
 * - `destructive-ungated` — destructive, and no credential is checked. A
 *   declared gap, not an endorsement: either no operator auth session reaches
 *   the program at all, or the gate was never written. Each one is listed in
 *   `docs/architecture/automation-studio/persistence.md`.
 */
export type ProgramEndpointClassification = "read" | "authoring" | "destructive" | "program-gated" | "destructive-ungated";

/**
 * Who calls. `channel` says how the call arrived: `paired-client` for a
 * connected client's token (its `permissions` are narrowed below its role's),
 * `panel` or absent otherwise. Under the `service` profile only a paired
 * client is narrowed by its permissions; everyone else by their policies.
 */
export type ProgramApiActor = {
  sessionId: string;
  userId: string;
  roleId: string;
  permissions: Permission[];
  channel?: "panel" | "paired-client";
};

/**
 * One call. `via` names who made it on the actor's behalf: `assistant` for
 * every tool call the panel assistant makes, written to the call's audit
 * rows; absent for the person's own. `pressGrant` is a press grant that
 * server code (never a request body, never a model) hands over after the
 * person pressed Allow; a panel page sends its grant as the payload's
 * `pressGrant` field instead. A grant never reaches a handler: `call()` drops
 * both from the request it hands on.
 */
export type ProgramApiRequest<TPayload = unknown> = {
  programId: string;
  endpoint: string;
  scope: ProgramScope;
  payload?: TPayload;
  actor?: ProgramApiActor;
  via?: IamRequestVia;
  pressGrant?: string;
};

export type ProgramApiResponse<TPayload = unknown> = {
  ok: boolean;
  payload?: TPayload;
  error?: string;
  /** Program-owned closed codes; carriers are bounded at the registry. */
  errorCode?: string;
};

export type ProgramApiHandler<TRequest = unknown, TResponse = unknown> = (
  request: ProgramApiRequest<TRequest>,
) => Promise<ProgramApiResponse<TResponse>> | ProgramApiResponse<TResponse>;

type ProgramApiRegistration = Partial<ProgramEndpointIamDeclaration> & {
  handler: ProgramApiHandler;
  permission: Permission;
  classification: ProgramEndpointClassification;
  assistant?: ProgramEndpointAssistant;
};

/** A stored registration: as declared, plus the program and action it is decided under. */
type StoredRegistration = {
  declared: ProgramApiRegistration;
  programId: string;
  iamAction: string;
};

/** The decision `call` made before the handler: its request (for the list filter) and the resources it decided on. */
type CallGate = { ok: true; request: ProgramIamRequest; resources: IamResource[] } | { ok: false; response: ProgramApiResponse<never> };

/**
 * One registration: its program, endpoint, today's permission and
 * classification, and its IAM declaration. The declaration is optional in the
 * type only so test doubles can register bare endpoints: every live
 * registration declares `action`, `accessLevel` and `resource` (a registry
 * test fails the build on any that does not), and an undeclared endpoint
 * evaluates against the workspace FRN, which grants no owner-conditioned
 * access.
 *
 * `assistant` says how the panel assistant may call the endpoint (its input,
 * summary, phrases and context arguments), or `{ hidden: <reason> }`. It is
 * optional in the type for the same reason; the assistant parity test fails
 * the build on any live registration without one.
 */
export type ProgramApiRegistrationParams = Partial<ProgramEndpointIamDeclaration> & {
  programId: string;
  endpoint: string;
  permission: Permission;
  classification: ProgramEndpointClassification;
  handler: ProgramApiHandler;
  assistant?: ProgramEndpointAssistant;
};

/** What `endpoints()` lists for one registration (the catalog generator and parity read it). */
export type ProgramApiEndpointSummary = Partial<ProgramEndpointIamDeclaration> & {
  programId: string;
  endpoint: string;
  permission: Permission;
  classification: ProgramEndpointClassification;
  assistant?: ProgramEndpointAssistant;
};

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, StoredRegistration>();
  private readonly identityAccess: IdentityAccessService | undefined;
  private readonly owners = new Map<ProgramOwnedResourceKind, ProgramResourceOwnerResolver>();
  private readonly iam: ProgramIamGate;
  private readonly pressGrants: PressGrantStore;
  private registeredActions: ProgramIamRegisteredAction[] | undefined;

  /**
   * The confirmation of `destructive` endpoints (a PIN, or a press grant)
   * runs here rather than in each handler, so Identity Access is a
   * registry-level collaborator. A registry built without one refuses every
   * destructive endpoint, which is the same refusal the handlers produced
   * when they were passed no Identity Access.
   *
   * `iam` says how calls are decided (`ProgramApiIamOptions`); by default the
   * `local` profile, which decides exactly as the permission check did.
   * `pressGrants` holds the grants minted here; tests pass one with a clock.
   */
  constructor(options: { identityAccess?: IdentityAccessService; iam?: ProgramApiIamOptions; pressGrants?: PressGrantStore } = {}) {
    this.identityAccess = options.identityAccess;
    this.iam = new ProgramIamGate(options.iam ?? {}, () => this.actions(), this.owners);
    this.pressGrants = options.pressGrants ?? new PressGrantStore();
  }

  /**
   * Adds an endpoint. Refuses a duplicate, an unknown program, and an IAM
   * declaration that disagrees with the catalog: `action` must be
   * `iamActionName(iamProgramService(programId), endpoint)` and `accessLevel`
   * `iamEndpointAccessLevel(action, endpoint, classification)`. Refuses a
   * malformed `assistant` declaration (`assistantDeclarationProblem`: among
   * the rest, money taken with no `spends`) and a tool that does not say what
   * it acts on (`assistantTargetProblem`).
   */
  register(params: ProgramApiRegistrationParams): void {
    const key = apiKey(params.programId, params.endpoint);
    if (this.handlers.has(key)) {
      throw new Error(`Duplicate global program API handler: ${key}`);
    }
    if (!GLOBAL_PROGRAMS.some((program) => program.id === params.programId)) {
      throw new Error(`Unknown global program id: ${params.programId}`);
    }
    const iamAction = iamActionName(iamProgramService(params.programId), params.endpoint);
    if (params.action !== undefined && params.action !== iamAction) {
      throw new Error(`${key} declares action ${params.action}; its action is ${iamAction}`);
    }
    if (params.accessLevel !== undefined) {
      const level = iamEndpointAccessLevel(iamAction, params.endpoint, params.classification);
      if (params.accessLevel !== level) throw new Error(`${key} declares access level ${params.accessLevel}; ${iamAction} is ${level}`);
    }
    const assistant = params.assistant;
    const assistantProblem = assistant === undefined ? undefined : assistantDeclarationProblem(assistant)
      ?? ("hidden" in assistant ? undefined : assistantTargetProblem({
        programId: params.programId,
        endpoint: params.endpoint,
        classification: params.classification,
        accessLevel: params.accessLevel ?? iamEndpointAccessLevel(iamAction, params.endpoint, params.classification),
        ...(params.resource === undefined ? {} : { resource: params.resource }),
        assistant
      }));
    if (assistantProblem !== undefined) throw new Error(`${key} declares an assistant entry that is wrong: ${assistantProblem}`);
    const { programId, endpoint: _endpoint, ...declared } = params;
    this.handlers.set(key, { declared, programId, iamAction });
    this.registeredActions = undefined;
    this.iam.invalidate();
  }

  /** Registers who owns resources of `kind` (one resolver per kind). */
  registerResourceOwners(kind: ProgramOwnedResourceKind, resolver: ProgramResourceOwnerResolver): void {
    if (this.owners.has(kind)) throw new Error(`Duplicate resource owner resolver: ${kind}`);
    this.owners.set(kind, resolver);
  }

  async call<TRequest = unknown, TResponse = unknown>(request: ProgramApiRequest<TRequest>): Promise<ProgramApiResponse<TResponse>> {
    const stored = this.handlers.get(apiKey(request.programId, request.endpoint));
    if (!stored) {
      return {
        ok: false,
        error: `Global program API handler not found: ${request.programId}/${request.endpoint}`,
        errorCode: "endpoint.not_found",
      };
    }
    const actor = request.actor;
    if (!actor) {
      return {
        ok: false,
        error: "Authentication is required for this program operation.",
        errorCode: "authorization.required",
      };
    }
    const registration = stored.declared;
    // An endpoint declared hidden from the assistant is never run for it, even
    // if a tool loop named it: the declaration is the boundary, not the offer.
    if (request.via === "assistant" && registration.assistant !== undefined && "hidden" in registration.assistant) {
      return { ok: false, error: registration.assistant.hidden, errorCode: "authorization.forbidden" };
    }
    // A destructive call a press grant confirms is decided, confirmed and
    // handled on its payload as sent (`payloadAsSent`), the one reading the
    // grant's digest binds: a field the digest cannot see (inherited,
    // undefined, behind a toJSON) never reaches IAM's resource or the handler.
    // Over HTTP this changes nothing. A PIN binds no payload, so a call that
    // carries one is read as it always was.
    const carriesPin = payloadCarriesPin(request.payload);
    const readAsSent = registration.classification === "destructive" && !carriesPin;
    const asked = readAsSent ? withPayloadAsSent(request as ProgramApiRequest) : { ok: true as const, request: request as ProgramApiRequest };
    if (!asked.ok) return asked.response;
    // How the person consented, from the grant this call carries, for its audit row; the confirmation below still decides the call.
    const consent = readAsSent ? pressGrantConsent({ grants: this.pressGrants, request: asked.request, actor, carriesPin }) : undefined;
    const gate = await this.decideCall(stored, asked.request, actor, consent);
    if (!gate.ok) return gate.response;
    // What the handler is handed: the request without any press grant, which
    // only the confirmation below reads, so no handler can store or echo one.
    const handed = withoutPressGrant(asked.request);
    const startedAt = performance.now();
    const measured = await withEndpointPerformanceScope(async (): Promise<ProgramApiResponse<TResponse>> => {
      try {
        // Destruction is the one thing a permission alone does not buy. The
        // check runs before the handler, so a refusal reaches the caller in the
        // same shape a handler-thrown refusal used to. A grant it accepts is
        // spent, whatever the handler then does.
        if (registration.classification === "destructive") {
          await confirmDestructiveCall({ identityAccess: this.identityAccess, grants: this.pressGrants, request: asked.request, actor, carriesPin });
        }
        const response = await registration.handler(handed);
        return (await this.afterSuccess(stored, handed, gate, response)) as ProgramApiResponse<TResponse>;
      } catch (error) {
        const diagnostic = error instanceof Error ? (error as Error & { diagnostic?: unknown }).diagnostic : undefined;
        const code = diagnostic && typeof diagnostic === "object" ? (diagnostic as { code?: unknown }).code : undefined;
        return { ok: false, error: error instanceof Error ? error.message : String(error), ...(typeof code === "string" && /^[a-z][a-z0-9_.]{0,99}$/u.test(code) ? { errorCode: code } : {}) };
      }
    });
    recordProgramEndpointPerformance({
      programId: request.programId,
      endpoint: request.endpoint,
      elapsedMs: performance.now() - startedAt,
      responseBytes: serializedMetricBytes(measured.result),
      ...measured.sql,
      ok: measured.result.ok,
    });
    return measured.result;
  }

  /**
   * Decides an app route's action (lane H2) with the same machinery as
   * `call`: under `local` and `self-hosted` exactly as
   * `actor.permissions.includes(permission)`, under `service` by the caller's
   * policies. Records one audit row. A failure to decide is a refusal.
   */
  async authorize(input: ProgramApiAuthorizeInput): Promise<ProgramApiAuthorization> {
    return this.decideAuthorization(input);
  }

  // `authorize`, with how the person consented when it decides a press grant's mint.
  private async decideAuthorization(input: ProgramApiAuthorizeInput, consent?: IamRequestConsent): Promise<ProgramApiAuthorization> {
    const actor = input.actor;
    if (!actor) return { allowed: false, decision: null, response: { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" } };
    try {
      const request = await this.iam.open(actor, input.origin, { action: input.action, permission: input.permission }, undefined, consent);
      const refs = input.resources === undefined ? [{ kind: "workspace" as const }] : refList(input.resources);
      const decision = request.authorizer.decide(input.action, await this.iam.resources(request, refs, input.programId ?? "~"));
      if (decision.decision === "allow") return { allowed: true, decision };
      return { allowed: false, decision, response: programForbiddenResponse(actor, input.permission, input.action) };
    } catch (error) {
      return { allowed: false, decision: null, response: { ok: false, error: error instanceof Error ? error.message : String(error) } };
    }
  }

  /**
   * Mints a press grant for one destructive call: what a person's press of
   * Delete or Allow obtains, from the panel page through
   * `PRESS_GRANT_MINT_ENDPOINT`, or from server code on the person's own
   * request (with that request's actor and no `via`): their press on the
   * assistant's confirm card, or their own words clearly asking for exactly
   * this call. `consent` says which (`press` or `words`); it is written to
   * the mint's audit row and to the confirmed call's, and neither the grant
   * nor any digest of it reaches an audit row. Refused for the assistant, a
   * caller not on a live panel session of its own (`personPressRefusal`), an
   * unknown consent, an endpoint that is not `destructive`, and a call IAM
   * would deny this actor on this payload (decided and audited as the call
   * itself will be). The grant is bound to the actor's session, the actor,
   * the endpoint and the payload, and lives 60 seconds.
   */
  async mintPressGrant(input: PressGrantMintRequest): Promise<ProgramApiResponse<PressGrantMinted>> {
    const refusal = await personPressRefusal(this.identityAccess, input.actor, input.via);
    if (refusal) return refusal;
    if (input.consent !== "press" && input.consent !== "words") return { ok: false, error: PRESS_GRANT_REFUSALS.personOnly, errorCode: "authorization.forbidden" };
    const actor = input.actor!;
    const stored = this.handlers.get(apiKey(input.programId, input.endpoint));
    if (!stored || stored.declared.classification !== "destructive") return { ok: false, error: PRESS_GRANT_REFUSALS.notConfirmable };
    // Decided and bound on the payload as sent, as `call()` will read it.
    const asked = withPayloadAsSent({ programId: input.programId, endpoint: input.endpoint, scope: input.scope ?? {}, payload: input.payload, actor });
    if (!asked.ok) return asked.response;
    const target = asked.request;
    const decided = await this.decideAuthorization({
      actor,
      action: stored.iamAction,
      permission: stored.declared.permission,
      resources: stored.declared.resource === undefined ? fallbackRef(stored.iamAction) : stored.declared.resource.of(target),
      programId: stored.programId
    }, input.consent);
    if (!decided.allowed) return decided.response;
    return { ok: true, payload: this.pressGrants.mint({ sessionId: actor.sessionId, actorId: actor.userId, programId: input.programId, endpoint: input.endpoint, payload: target.payload }, input.consent) };
  }

  endpoints(): ProgramApiEndpointSummary[] {
    return [...this.handlers.entries()].map(([key, stored]) => {
      const [programId = "", endpoint = ""] = key.split(":", 2);
      const { handler: _handler, ...declared } = stored.declared;
      return { programId, endpoint, ...declared };
    });
  }

  private actions(): ProgramIamRegisteredAction[] {
    this.registeredActions ??= [...this.handlers.values()].map((stored) => ({ action: stored.iamAction, programId: stored.programId, permission: stored.declared.permission }));
    return this.registeredActions;
  }

  // The decision before the handler runs, on the declared resources (or, for
  // an undeclared registration, B2's resource rule: an operator program's own
  // FRN, else the workspace) with their owners; decided and audited once. A
  // failure to decide is an error response, and the handler never runs.
  private async decideCall(stored: StoredRegistration, request: ProgramApiRequest, actor: ProgramApiActor, consent: IamRequestConsent | undefined): Promise<CallGate> {
    const registration = stored.declared;
    try {
      const iam = await this.iam.open(actor, undefined, undefined, request.via, consent);
      const refs = registration.resource === undefined ? [fallbackRef(stored.iamAction)] : refList(registration.resource.of(request));
      const resources = await this.iam.resources(iam, refs, stored.programId);
      const decision = iam.authorizer.decide(stored.iamAction, resources);
      if (decision.decision === "deny") return { ok: false, response: programForbiddenResponse(actor, registration.permission, stored.iamAction) };
      return { ok: true, request: iam, resources };
    } catch (error) {
      return { ok: false, response: { ok: false, error: error instanceof Error ? error.message : String(error) } };
    }
  }

  // After the handler succeeds: record the owner of what it created, and keep
  // only the list items the caller may see.
  private async afterSuccess(stored: StoredRegistration, request: ProgramApiRequest, gate: Extract<CallGate, { ok: true }>, response: ProgramApiResponse): Promise<ProgramApiResponse> {
    const registration = stored.declared;
    if (!response.ok) return response;
    if (registration.creates && request.actor) await recordProgramCreatedOwner(this.owners, registration.creates(response.payload, request), request.actor.userId);
    const listScope = gate.resources[0];
    if (!registration.list || listScope === undefined) return response;
    return filterProgramList(this.iam, gate.request, { list: registration.list, action: stored.iamAction, programId: stored.programId, listScope, response });
  }
}

function apiKey(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}:${endpoint.trim().toLowerCase()}`;
}

function refList(refs: ProgramResourceRef | readonly ProgramResourceRef[]): readonly ProgramResourceRef[] {
  return isRefList(refs) ? refs : [refs];
}

function isRefList(refs: ProgramResourceRef | readonly ProgramResourceRef[]): refs is readonly ProgramResourceRef[] {
  return Array.isArray(refs);
}

function fallbackRef(action: string): ProgramResourceRef {
  return action.startsWith("ops:") ? { kind: "program" } : { kind: "workspace" };
}

/** The request with its payload as sent, or the refusal of a payload JSON cannot carry (a cycle, a BigInt). */
function withPayloadAsSent(request: ProgramApiRequest): { ok: true; request: ProgramApiRequest } | { ok: false; response: ProgramApiResponse<never> } {
  try {
    return { ok: true, request: request.payload === undefined ? request : { ...request, payload: payloadAsSent(request.payload) } };
  } catch {
    return { ok: false, response: { ok: false, error: "The action's details could not be read." } };
  }
}

/** The request without a press grant, as a field of its own or of its payload; the same object when it carries none. */
function withoutPressGrant(request: ProgramApiRequest): ProgramApiRequest {
  const payload = request.payload;
  const inPayload = payload !== null && typeof payload === "object" && !Array.isArray(payload) && Object.hasOwn(payload, "pressGrant");
  if (!inPayload && request.pressGrant === undefined) return request;
  const { pressGrant: _grant, ...rest } = request;
  if (!inPayload) return rest;
  const { pressGrant: _payloadGrant, ...kept } = payload as Record<string, unknown>;
  return { ...rest, payload: kept };
}
