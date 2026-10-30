import { iamActionName } from "@fluxiq/contracts/iam";
import { iamEndpointAccessLevel, iamProgramService } from "../../platform/iam/catalog/index.ts";
import type { IamResource } from "../../platform/iam/index.ts";
import type { IdentityAccessService } from "../identity-access/index.ts";
import type { Permission } from "../identity-access/types.ts";
import { authorizeProgramPin, type ProgramPinAuthorizationPayload } from "./authorization.ts";
import { GLOBAL_PROGRAMS } from "./catalog.ts";
import { recordProgramEndpointPerformance, serializedMetricBytes, withEndpointPerformanceScope } from "./performance-metrics.ts";
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
  type ProgramResourceOwnerResolver,
  type ProgramResourceRef
} from "./iam/index.ts";

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
 *   external action. `call()` requires the operator's session PIN before the
 *   handler runs.
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

export type ProgramApiRequest<TPayload = unknown> = {
  programId: string;
  endpoint: string;
  scope: ProgramScope;
  payload?: TPayload;
  actor?: ProgramApiActor;
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
 */
export type ProgramApiRegistrationParams = Partial<ProgramEndpointIamDeclaration> & {
  programId: string;
  endpoint: string;
  permission: Permission;
  classification: ProgramEndpointClassification;
  handler: ProgramApiHandler;
};

/** What `endpoints()` lists for one registration (the catalog generator and parity read it). */
export type ProgramApiEndpointSummary = Partial<ProgramEndpointIamDeclaration> & {
  programId: string;
  endpoint: string;
  permission: Permission;
  classification: ProgramEndpointClassification;
};

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, StoredRegistration>();
  private readonly identityAccess: IdentityAccessService | undefined;
  private readonly owners = new Map<ProgramOwnedResourceKind, ProgramResourceOwnerResolver>();
  private readonly iam: ProgramIamGate;
  private registeredActions: ProgramIamRegisteredAction[] | undefined;

  /**
   * The PIN check for `destructive` endpoints runs here rather than in each
   * handler, so Identity Access is a registry-level collaborator. A registry
   * built without one refuses every destructive endpoint, which is the same
   * refusal the handlers produced when they were passed no Identity Access.
   *
   * `iam` says how calls are decided (`ProgramApiIamOptions`); by default the
   * `local` profile, which decides exactly as the permission check did.
   */
  constructor(options: { identityAccess?: IdentityAccessService; iam?: ProgramApiIamOptions } = {}) {
    this.identityAccess = options.identityAccess;
    this.iam = new ProgramIamGate(options.iam ?? {}, () => this.actions(), this.owners);
  }

  /**
   * Adds an endpoint. Refuses a duplicate, an unknown program, and an IAM
   * declaration that disagrees with the catalog: `action` must be
   * `iamActionName(iamProgramService(programId), endpoint)` and `accessLevel`
   * `iamEndpointAccessLevel(action, endpoint, classification)`.
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
    if (!request.actor) {
      return {
        ok: false,
        error: "Authentication is required for this program operation.",
        errorCode: "authorization.required",
      };
    }
    const registration = stored.declared;
    const gate = await this.decideCall(stored, request as ProgramApiRequest, request.actor);
    if (!gate.ok) return gate.response;
    const startedAt = performance.now();
    const measured = await withEndpointPerformanceScope(async (): Promise<ProgramApiResponse<TResponse>> => {
      try {
        // Destruction is the one thing a permission alone does not buy. The
        // check runs before the handler, so a refusal reaches the caller in the
        // same shape a handler-thrown refusal used to.
        if (registration.classification === "destructive") {
          await authorizeProgramPin(this.identityAccess, pinAuthorizationPayload(request.payload));
        }
        const response = await registration.handler(request);
        return (await this.afterSuccess(stored, request as ProgramApiRequest, gate, response)) as ProgramApiResponse<TResponse>;
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
    const actor = input.actor;
    if (!actor) return { allowed: false, decision: null, response: { ok: false, error: "Authentication is required for this program operation.", errorCode: "authorization.required" } };
    try {
      const request = await this.iam.open(actor, input.origin, { action: input.action, permission: input.permission });
      const refs = input.resources === undefined ? [{ kind: "workspace" as const }] : refList(input.resources);
      const decision = request.authorizer.decide(input.action, await this.iam.resources(request, refs, input.programId ?? "~"));
      if (decision.decision === "allow") return { allowed: true, decision };
      return { allowed: false, decision, response: programForbiddenResponse(actor, input.permission, input.action) };
    } catch (error) {
      return { allowed: false, decision: null, response: { ok: false, error: error instanceof Error ? error.message : String(error) } };
    }
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
  private async decideCall(stored: StoredRegistration, request: ProgramApiRequest, actor: ProgramApiActor): Promise<CallGate> {
    const registration = stored.declared;
    try {
      const iam = await this.iam.open(actor);
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

function pinAuthorizationPayload(payload: unknown): ProgramPinAuthorizationPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as ProgramPinAuthorizationPayload) : {};
}
