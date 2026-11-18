import type { CloudAdmissionOptions, CloudAdmissionService, EnvironmentDriver, EnvironmentEnrolmentRoutes, EnvironmentStore } from "fluxiq/platform";
import type { FluxIQDeploymentSettings } from "fluxiq/platform/profile";
import type { WorkspaceLease } from "../../lib/workspaces";

/** Holds one workspace's instance open for a caller: the workspace manager's `acquire`. */
export type EnvironmentWorkspaceAcquire = (workspaceId: string) => Promise<WorkspaceLease>;

/** What a tenant's enrolment needs: the workspaces, the environment records, the ticket routes and the domain the client declares. */
export type TenantEnrolmentOptions = {
  acquire: EnvironmentWorkspaceAcquire;
  store: Pick<EnvironmentStore, "get">;
  routes: EnvironmentEnrolmentRoutes;
  domainId: string;
  /** How long a minted ticket lives; the gateway's default (60 s) when omitted. */
  ttlMs?: number;
};

/**
 * The controller's authorities and driver, injected by the server's
 * composition: the commerce admission (`CloudAdmissionService`-shaped) and
 * the IAM target resolver it was built with.
 */
export type EnvironmentControllerInputs<Actor> = {
  admission: Pick<CloudAdmissionService<Actor>, "admit">;
  authorize: CloudAdmissionOptions<Actor>["authorize"];
  driver: EnvironmentDriver;
  /** The domain an environment's client declares in its hello. */
  domainId: string;
  ttlMs?: number;
};

/** Everything `composeEnvironmentController` wires, the server's runtime pieces included. */
export type EnvironmentControllerComposition<Actor> = EnvironmentControllerInputs<Actor> & {
  profile: FluxIQDeploymentSettings["profile"];
  store: EnvironmentStore;
  acquire: EnvironmentWorkspaceAcquire;
  routes: EnvironmentEnrolmentRoutes;
};
