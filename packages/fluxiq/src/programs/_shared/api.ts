import type { IdentityAccessService } from "../identity-access/index.ts";
import type { Permission } from "../identity-access/types.ts";
import { authorizeProgramPin, type ProgramPinAuthorizationPayload } from "./authorization.ts";
import { GLOBAL_PROGRAMS } from "./catalog.ts";
import { recordProgramEndpointPerformance, serializedMetricBytes, withEndpointPerformanceScope } from "./performance-metrics.ts";
import type { ProgramScope } from "./types.ts";

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

export type ProgramApiActor = {
  sessionId: string;
  userId: string;
  roleId: string;
  permissions: Permission[];
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
  errorCode?: "authorization.required" | "authorization.forbidden" | "endpoint.not_found";
};

export type ProgramApiHandler<TRequest = unknown, TResponse = unknown> = (
  request: ProgramApiRequest<TRequest>,
) => Promise<ProgramApiResponse<TResponse>> | ProgramApiResponse<TResponse>;

type ProgramApiRegistration = {
  handler: ProgramApiHandler;
  permission: Permission;
  classification: ProgramEndpointClassification;
};

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, ProgramApiRegistration>();
  private readonly identityAccess: IdentityAccessService | undefined;

  /**
   * The PIN check for `destructive` endpoints runs here rather than in each
   * handler, so Identity Access is a registry-level collaborator. A registry
   * built without one refuses every destructive endpoint, which is the same
   * refusal the handlers produced when they were passed no Identity Access.
   */
  constructor(options: { identityAccess?: IdentityAccessService } = {}) {
    this.identityAccess = options.identityAccess;
  }

  register(params: {
    programId: string;
    endpoint: string;
    permission: Permission;
    classification: ProgramEndpointClassification;
    handler: ProgramApiHandler;
  }): void {
    const key = apiKey(params.programId, params.endpoint);
    if (this.handlers.has(key)) {
      throw new Error(`Duplicate global program API handler: ${key}`);
    }
    if (!GLOBAL_PROGRAMS.some((program) => program.id === params.programId)) {
      throw new Error(`Unknown global program id: ${params.programId}`);
    }
    this.handlers.set(key, { handler: params.handler, permission: params.permission, classification: params.classification });
  }

  async call<TRequest = unknown, TResponse = unknown>(request: ProgramApiRequest<TRequest>): Promise<ProgramApiResponse<TResponse>> {
    const registration = this.handlers.get(apiKey(request.programId, request.endpoint));
    if (!registration) {
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
    if (!request.actor.permissions.includes(registration.permission)) {
      return {
        ok: false,
        error: `Permission required: ${registration.permission}`,
        errorCode: "authorization.forbidden",
      };
    }
    const startedAt = performance.now();
    const measured = await withEndpointPerformanceScope(async (): Promise<ProgramApiResponse<TResponse>> => {
      try {
        // Destruction is the one thing a permission alone does not buy. The
        // check runs before the handler, so a refusal reaches the caller in the
        // same shape a handler-thrown refusal used to.
        if (registration.classification === "destructive") {
          await authorizeProgramPin(this.identityAccess, pinAuthorizationPayload(request.payload));
        }
        return (await registration.handler(request)) as ProgramApiResponse<TResponse>;
      } catch (error) {
        return { ok: false, error: error instanceof Error ? error.message : String(error) };
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

  endpoints(): Array<{ programId: string; endpoint: string; permission: Permission; classification: ProgramEndpointClassification }> {
    return [...this.handlers.entries()].map(([key, registration]) => {
      const [programId = "", endpoint = ""] = key.split(":", 2);
      return { programId, endpoint, permission: registration.permission, classification: registration.classification };
    });
  }
}

function apiKey(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}:${endpoint.trim().toLowerCase()}`;
}

function pinAuthorizationPayload(payload: unknown): ProgramPinAuthorizationPayload {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? (payload as ProgramPinAuthorizationPayload) : {};
}
