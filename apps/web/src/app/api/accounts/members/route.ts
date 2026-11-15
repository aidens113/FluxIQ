import { appRouteIamContract } from "../../../../lib/app-route-iam";
import { withWorkspaceAccountRead } from "../../../../lib/workspaces/account-reads";
import { assembleMemberList } from "../server/member-list";

const ROUTE = appRouteIamContract("GET", "/api/accounts/members");

/** The workspace's people, their roles and invites, for an administrator. */
export async function GET(request: Request) {
  return withWorkspaceAccountRead(request, ROUTE, async context => ({
    status: 200,
    body: { ok: true, payload: await assembleMemberList({
      workspaceId: context.workspaceId, actorUserId: context.userId, profile: context.profile, tenancy: context.tenancy,
      store: context.store, identityAccess: context.identityAccess
    }) }
  }));
}
