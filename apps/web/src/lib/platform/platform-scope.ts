import { getFluxIQ, getFluxIQWorkspaces } from "../fluxiq";
import type { PlatformScope } from "./PlatformScope";

/**
 * The one explicit accessor for platform scope. It wraps `getFluxIQ()` so the
 * lazy start of shared runtime services stays, and hands back only the narrow
 * platform surface, never the instance.
 */
export function platformScope(): PlatformScope {
  const primary = getFluxIQ();
  return Object.freeze({
    identityAccess: primary.programs.identityAccess,
    fluxiqDir: primary.paths.fluxiq,
    tenancy: getFluxIQWorkspaces().tenancy
  });
}
