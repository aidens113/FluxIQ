import type { IdentityAccessService } from "fluxiq";
import type { PlatformProvisioning, PlatformStore } from "fluxiq/platform";
import type { AppRouteActor, AppRouteAuthorizer } from "../../../../lib/app-route-iam";

/**
 * The platform side of an accounts call, resolved only after IAM allowed it,
 * so a refused caller never reaches the platform store:
 *
 * - `provisioning`, `store`: the platform's provisioning service (every change
 *   goes through it, as an in-process caller) and its store (reads);
 * - `workspaceId`: the workspace the caller's session works in;
 * - `tenancy`: `single` (local, self-hosted, and `service` until it is
 *   multi-tenant) or `multi`.
 */
export type AccountPlatform = {
  provisioning: PlatformProvisioning;
  store: Pick<PlatformStore, "getAccount" | "getMembership" | "getWorkspace" | "listMembershipsOfWorkspace">;
  workspaceId: string;
  tenancy: "single" | "multi";
};

/**
 * What an `/api/accounts` handler works with, built per request by the route
 * (`accountRouteDepsForRequest`) and passed whole so tests use the real
 * services over memory doubles.
 *
 * - `actor`: the signed-in caller, as the app-route IAM decision takes it;
 *   `sessionId` is their panel session, used only to re-prove credentials;
 * - `authorizer`: the registry's `authorize`, which decides and audits;
 * - `identityAccess`: the people list and the credential re-proof;
 * - `profile`: decides which roles are offered;
 * - `platform`: the rest, resolved after the decision.
 */
export type AccountRouteDeps = {
  actor: AppRouteActor & { userId: string };
  sessionId: string;
  authorizer: AppRouteAuthorizer;
  identityAccess: Pick<IdentityAccessService, "snapshot" | "authorizeSessionCredentials">;
  profile: "local" | "self-hosted" | "service";
  platform(): Promise<AccountPlatform>;
};
