// The web server's dedicated environments (hosted-cloud interface I3): the
// controller composed with an injected admission, its durable store, and
// enrolment of each environment's client at its own tenant's gateway, with
// the routing and authority the hosted gateway transport asks of it.
// Design: docs/architecture/dedicated-browser-environments.md.
export { authorizeEnvironmentBinding } from "./authorize-environment-binding";
export { composeEnvironmentController } from "./compose-controller";
export { createEnvironmentController } from "./web-controller";
export { createTenantEnrolment } from "./tenant-enrolment";
export { environmentEnrolmentRoutes } from "./enrolment-routes";
export { environmentLive } from "./environment-live";
export { getEnvironmentStore } from "./environment-store";
export { resolveEnvironmentEnrolmentRoute } from "./resolve-enrolment-route";
export type { EnvironmentControllerComposition, EnvironmentControllerInputs, EnvironmentWorkspaceAcquire, TenantEnrolmentOptions } from "./types";
