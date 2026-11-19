import type { IdentityAccessService } from "fluxiq";
import type { WorkspaceTenancy } from "../workspaces";

/**
 * The platform scope: who people are, their sessions, login attempts, the
 * owner claim and platform audit. It never carries the primary instance, so
 * code that holds it cannot reach workspace data (keys, gateway, API, paths).
 */
export type PlatformScope = Readonly<{
  identityAccess: IdentityAccessService;
  /** The platform directory (`.fluxiq` at the data root) that holds login-attempt stores and the owner claim. */
  fluxiqDir: string;
  tenancy: WorkspaceTenancy;
}>;
