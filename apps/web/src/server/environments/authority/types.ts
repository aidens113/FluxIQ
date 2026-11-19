import type { EnvironmentStore, PlatformStore } from "fluxiq/platform";
import type { WorkspaceRouteContext } from "../../../lib/workspaces";

/**
 * Who acts on a dedicated environment: the held authority of the panel
 * request that asked (a route's `WorkspaceRouteContext`), never a DTO. The
 * resolver revalidates it on every decision, so the caller's identity,
 * workspace, action and target IAM are decided again by that route's own
 * contract, not trusted from the moment the request began.
 */
export type HostedEnvironmentActor = Pick<WorkspaceRouteContext, "workspaceId" | "revalidate">;

/** What the resolver reads: who pays for a workspace, who owns an environment, and the region environments run in. */
export type HostedCloudAuthorizerDeps = {
  workspaces: Pick<PlatformStore, "getWorkspace">;
  environments: Pick<EnvironmentStore, "get">;
  region: string;
};
