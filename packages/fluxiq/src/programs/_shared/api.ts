import { GLOBAL_PROGRAMS } from "./catalog";
import type { ProgramScope } from "./types";

export type ProgramApiRequest<TPayload = unknown> = {
  programId: string;
  endpoint: string;
  scope: ProgramScope;
  payload?: TPayload;
};

export type ProgramApiResponse<TPayload = unknown> = {
  ok: boolean;
  payload?: TPayload;
  error?: string;
};

export type ProgramApiHandler<TRequest = unknown, TResponse = unknown> = (
  request: ProgramApiRequest<TRequest>
) => Promise<ProgramApiResponse<TResponse>> | ProgramApiResponse<TResponse>;

export class GlobalProgramApiRegistry {
  private readonly handlers = new Map<string, ProgramApiHandler>();

  register(params: {
    programId: string;
    endpoint: string;
    handler: ProgramApiHandler;
  }): void {
    const key = apiKey(params.programId, params.endpoint);
    if (this.handlers.has(key)) {
      throw new Error(`Duplicate global program API handler: ${key}`);
    }
    if (!GLOBAL_PROGRAMS.some((program) => program.id === params.programId)) {
      throw new Error(`Unknown global program id: ${params.programId}`);
    }
    this.handlers.set(key, params.handler);
  }

  async call<TRequest = unknown, TResponse = unknown>(
    request: ProgramApiRequest<TRequest>
  ): Promise<ProgramApiResponse<TResponse>> {
    const handler = this.handlers.get(apiKey(request.programId, request.endpoint));
    if (!handler) {
      return { ok: false, error: `Global program API handler not found: ${request.programId}/${request.endpoint}` };
    }
    try {
      return await handler(request) as ProgramApiResponse<TResponse>;
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  }

  endpoints(): Array<{ programId: string; endpoint: string }> {
    return [...this.handlers.keys()].map((key) => {
      const [programId = "", endpoint = ""] = key.split(":", 2);
      return { programId, endpoint };
    });
  }
}

function apiKey(programId: string, endpoint: string): string {
  return `${programId.trim().toLowerCase()}:${endpoint.trim().toLowerCase()}`;
}
