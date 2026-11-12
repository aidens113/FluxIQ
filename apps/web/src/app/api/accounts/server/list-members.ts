import { roleOfIdentityRole, roleOfPolicies, type MemberRow, type MemberState, type MembersView } from "../../../../features/accounts/model";
import type { AccountRouteDeps } from "./route-deps";
import { accountRouteContract } from "./contract-for";
import type { AccountsResponse } from "./accounts-response";
import { assignableRoles } from "./assignable-roles";
import { authorizeAccountRoute } from "./authorize-account-route";
import { isPendingInvite } from "./is-pending-invite";

type IdentityUser = Awaited<ReturnType<AccountRouteDeps["identityAccess"]["snapshot"]>>["users"][number];

/**
 * `GET /api/accounts/members`: the workspace's people with their role and
 * state, for an administrator. Members come from the workspace's active
 * memberships; under one workspace, a person added before accounts existed
 * (an Identity Access user with no account) is listed too, as `identity`.
 * Each row is built field by field: no hash, credential, session or link
 * reaches the answer.
 */
export async function listMembers(deps: AccountRouteDeps): Promise<AccountsResponse> {
  const refusal = await authorizeAccountRoute(deps, accountRouteContract("GET", "/api/accounts/members"));
  if (refusal) return refusal;
  const platform = await deps.platform();
  const users = new Map((await deps.identityAccess.snapshot()).users.map((user) => [user.id, user]));
  const members: MemberRow[] = [];
  const listed = new Set<string>();
  for (const membership of await platform.store.listMembershipsOfWorkspace(platform.workspaceId)) {
    if (membership.status !== "active") continue;
    const account = await platform.store.getAccount(membership.userId);
    if (account === null || account.status === "deleted") continue;
    const user = users.get(account.userId);
    listed.add(account.userId);
    members.push({
      userId: account.userId,
      name: account.displayName,
      email: account.email,
      role: roleOfPolicies(membership.policies),
      state: accountState(account, user),
      source: "account",
      self: account.userId === deps.actor.userId,
      invitedAt: account.createdAtMs,
      lastSignInAt: account.lastSignInAtMs
    });
  }
  if (platform.tenancy === "single") {
    for (const user of users.values()) {
      if (listed.has(user.id) || (await platform.store.getAccount(user.id)) !== null) continue;
      members.push({
        userId: user.id,
        name: user.displayName,
        email: user.username,
        role: roleOfIdentityRole(user.roleId),
        state: user.enabled ? "active" : "turned-off",
        source: "identity",
        self: user.id === deps.actor.userId,
        invitedAt: null,
        lastSignInAt: null
      });
    }
  }
  const workspace = await platform.store.getWorkspace(platform.workspaceId);
  const view: MembersView = {
    workspaceKind: workspace?.kind ?? "single",
    assignableRoles: assignableRoles(deps.profile),
    canRemove: platform.tenancy === "single",
    members
  };
  return { status: 200, body: { ok: true, payload: view } };
}

/** Turned off when the account or its sign-in is; invited while the welcome link is the only way in (`isPendingInvite`). */
function accountState(account: { status: string; emailVerifiedAtMs: number | null; lastSignInAtMs: number | null }, user: IdentityUser | undefined): MemberState {
  if (account.status === "disabled" || user?.enabled === false) return "turned-off";
  return isPendingInvite(account, user) ? "invited" : "active";
}
