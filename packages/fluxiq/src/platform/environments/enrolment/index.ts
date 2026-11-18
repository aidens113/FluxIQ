// Tenant-bound enrolment of a dedicated environment's client: the managed
// host id an environment enrols under, and the table that routes a minted
// ticket to the tenant whose gateway minted it.
export { ENVIRONMENT_HOST_ID_PREFIX } from "./host-id-prefix.ts";
export { environmentHostId } from "./environment-host-id.ts";
export { environmentOfHost } from "./environment-of-host.ts";
export { EnvironmentEnrolmentRoutes } from "./ticket-routes.ts";
export type { EnvironmentEnrolmentDestination, EnvironmentEnrolmentRoute, EnvironmentEnrolmentTimer } from "./types.ts";
