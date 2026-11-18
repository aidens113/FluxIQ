import type { EnvironmentController } from "fluxiq/platform";
import { resolveFluxIQProfile } from "fluxiq/platform/profile";
import { composeEnvironmentController } from "./compose-controller";
import { environmentEnrolmentRoutes } from "./enrolment-routes";
import { getEnvironmentStore } from "./environment-store";
import type { EnvironmentControllerInputs } from "./types";

/**
 * The controller for this web server, with the admission and the IAM
 * resolver it was built with injected by the caller (the commerce
 * composition's cloud admission). Its store lives at
 * `<FluxIQ root>/platform/environments`, and its clients enrol at their own
 * tenants' gateways through this process's workspace manager.
 */
export async function createEnvironmentController<Actor>(inputs: EnvironmentControllerInputs<Actor>): Promise<EnvironmentController<Actor>> {
  // Imported on use: the runtime constructs the workspace manager.
  const { getFluxIQAfterReload, getFluxIQWorkspaces } = await import("../../lib/fluxiq");
  const primary = await getFluxIQAfterReload();
  const manager = getFluxIQWorkspaces();
  return composeEnvironmentController<Actor>({
    ...inputs,
    profile: resolveFluxIQProfile(process.env),
    store: getEnvironmentStore(primary.paths.fluxiq),
    acquire: (workspaceId) => manager.acquire(workspaceId),
    routes: environmentEnrolmentRoutes
  });
}
