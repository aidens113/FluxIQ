// Barrel for the web server's workspace manager (hosted production plan,
// Tenancy And Data; t813): one FluxIQ instance per workspace, idle eviction
// under an LRU cap, key custody that outlives an eviction, the hosted IAM
// wiring, and the per-request lookup routes and pages call.
//
// `lib/fluxiq` builds the manager and holds it for the process; this
// directory never imports it statically.
export { createTenantFluxIQ } from "./create-tenant";
export { DeferredIamAuditSink } from "./deferred-audit-sink";
export { initializeFluxIQWebStorage } from "./initialize-storage";
export { instanceBusy } from "./instance-busy";
export { workspaceManagerLimits } from "./manager-limits";
export { primaryWorkspaceId } from "./primary-workspace-id";
export { serviceWorkspaceIam } from "./service-iam";
export { sessionIdOf } from "./session-id-of";
export { sessionWorkspaceId } from "./session-workspace";
export { workspaceTenancyOfProfile } from "./tenancy-of-profile";
export { workspaceFluxIQ } from "./workspace-fluxiq";
export { FluxIQWorkspaceManager } from "./workspace-manager";
export type { WorkspaceEntry, WorkspaceLease } from "./WorkspaceEntry";
export type { WorkspaceManagerOptions } from "./WorkspaceManagerOptions";
export type { WorkspaceRequestSource } from "./session-id-of";
export type { WorkspaceTenancy } from "./tenancy-of-profile";
