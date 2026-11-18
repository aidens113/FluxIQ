import { EnvironmentEnrolmentRoutes } from "fluxiq/platform";

const state = globalThis as typeof globalThis & { __fluxiqEnvironmentEnrolmentRoutes?: EnvironmentEnrolmentRoutes };

/** The process's one ticket route table: tenant gateways mint in this process, and the hosted transport routes from it. */
export const environmentEnrolmentRoutes = state.__fluxiqEnvironmentEnrolmentRoutes ??= new EnvironmentEnrolmentRoutes();
