import { roleOfIdentityRole, roleOfPolicies, type MemberRow, type MemberState, type MembersView } from "../../../../../features/accounts/model";
import { assignableRoles } from "../assignable-roles";
import { isPendingInvite } from "../is-pending-invite";
import type { MemberListReadSource } from "./types";

type IdentityUser = Awaited<ReturnType<MemberListReadSource["identityAccess"]["snapshot"]>>["users"][number];

/** Builds allowlisted member rows using an already-authorized, workspace-bound read source. */
export async function assembleMemberList(source: MemberListReadSource): Promise<MembersView> {
  const users = new Map((await source.identityAccess.snapshot()).users.map(user => [user.id, user]));
  const members: MemberRow[] = [];
  const listed = new Set<string>();
  for (const membership of await source.store.listMemberships()) {
    if (membership.workspaceId !== source.workspaceId || membership.status !== "active") continue;
    const account = await source.store.getAccount(membership.userId);
    if (account === null || account.userId !== membership.userId || account.status === "deleted") continue;
    const current = await source.store.getMembership(membership.userId);
    if (!current || current.workspaceId !== source.workspaceId || current.userId !== membership.userId || current.status !== "active") continue;
    const user = users.get(account.userId);
    listed.add(account.userId);
    members.push({
      userId: account.userId,
      name: account.displayName,
      email: account.email,
      role: roleOfPolicies(current.policies),
      state: accountState(account, user),
      source: "account",
      self: account.userId === source.actorUserId,
      invitedAt: account.createdAtMs,
      lastSignInAt: account.lastSignInAtMs
    });
  }
  if (source.tenancy === "single") {
    for (const user of users.values()) {
      if (listed.has(user.id) || (await source.store.getAccount(user.id)) !== null) continue;
      members.push({
        userId: user.id,
        name: user.displayName,
        email: user.username,
        role: roleOfIdentityRole(user.roleId),
        state: user.enabled ? "active" : "turned-off",
        source: "identity",
        self: user.id === source.actorUserId,
        invitedAt: null,
        lastSignInAt: null
      });
    }
  }
  const workspace = await source.store.getWorkspace();
  const readOnly = source.profile === "service" || source.tenancy === "multi";
  return {
    workspaceKind: workspace?.kind ?? "single",
    assignableRoles: assignableRoles(source.profile),
    readOnly,
    canRemove: !readOnly && source.tenancy === "single",
    members
  };
}

function accountState(account: { status: string; emailVerifiedAtMs: number | null; lastSignInAtMs: number | null }, user: IdentityUser | undefined): MemberState {
  if (account.status === "disabled" || user?.enabled === false) return "turned-off";
  return isPendingInvite(account, user) ? "invited" : "active";
}
