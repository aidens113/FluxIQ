import type { AccountRouteDeps } from "./route-deps";
import { accountRouteContract } from "./contract-for";
import type { AccountsResponse } from "./accounts-response";
import { authorizeAccountRoute } from "./authorize-account-route";
import { assembleMemberList } from "./member-list";

/** Existing callers retain the real authorized wrapper; assembly owns only reads. */
export async function listMembers(deps: AccountRouteDeps): Promise<AccountsResponse> {
  const refusal = await authorizeAccountRoute(deps, accountRouteContract("GET", "/api/accounts/members"));
  if (refusal) return refusal;
  const platform = await deps.platform();
  const payload = await assembleMemberList({
    workspaceId: platform.workspaceId, actorUserId: deps.actor.userId, profile: deps.profile, tenancy: platform.tenancy,
    identityAccess: deps.identityAccess,
    store: {
      getAccount: userId => platform.store.getAccount(userId),
      getMembership: userId => platform.store.getMembership(platform.workspaceId, userId),
      getWorkspace: () => platform.store.getWorkspace(platform.workspaceId),
      listMemberships: () => platform.store.listMembershipsOfWorkspace(platform.workspaceId)
    }
  });
  return { status: 200, body: { ok: true, payload } };
}
