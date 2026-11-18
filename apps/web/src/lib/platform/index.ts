// Barrel for platform scope (identity, sessions, login attempts, owner claim,
// platform audit): the one accessor that app routes and pages use instead of
// the primary instance.
export type { PlatformScope } from "./PlatformScope";
export { platformScope } from "./platform-scope";
export { presentSingleTenantPanelSession } from "./present-single-tenant-session";
