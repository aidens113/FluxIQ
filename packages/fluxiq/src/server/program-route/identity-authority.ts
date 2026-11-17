import type { ProgramApiActor } from "../../programs/_shared/api.ts";

/**
 * Identity authority supplied by the server hosting the route. A multi-tenant
 * host supplies its platform identity service while `context.fluxiq` remains
 * the already selected workspace. This port never comes from request data.
 */
export type ProgramRouteIdentityAuthority = {
  validateSession(sessionId: string): Promise<{
    user: { id: string };
    role: { id: string; permissions: ProgramApiActor["permissions"] };
    session: { expiresAtMs: number };
  } | null>;
  snapshot(): Promise<{
    users: ReadonlyArray<{ id: string; roleId: string; enabled: boolean }>;
    roles: ReadonlyArray<{ id: string; permissions: readonly string[] }>;
  }>;
};
