import type { Permission } from "../identity-access/types.ts";
import { GLOBAL_PROGRAMS } from "./catalog.ts";
import {
  recordProgramEndpointPerformance,
  serializedMetricBytes,
  withEndpointPerformanceScope
} from "./performance-metrics.ts";
import type { ProgramScope } from "./types.ts";

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

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, { handler: ProgramApiHandler; permission: Permission }>();

  register(params: { programId: string; endpoint: string; permission: Permission; handler: ProgramApiHandler }): void {
    const key = apiKey(params.programId, params.endpoint);
    if (this.handlers.has(key)) {
      throw new Error(`Duplicate global program API handler: ${key}`);
    }
    if (!GLOBAL_PROGRAMS.some((program) => program.id === params.programId)) {
      throw new Error(`Unknown global program id: ${params.programId}`);
    }
    this.handlers.set(key, { handler: params.handler, permission: params.permission });
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
      ok: measured.result.ok
    });
    return measured.result;
  }

  endpoints(): Array<{ programId: string; endpoint: string; permission: Permission }> {
    return [...this.handlers.entries()].map(([key, registration]) => {
      const [programId = "", endpoint = ""] = key.split(":", 2);
      return { programId, endpoint, permission: registration.permission };
    });
  }
}

function apiKey(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}:${endpoint.trim().toLowerCase()}`;
}
