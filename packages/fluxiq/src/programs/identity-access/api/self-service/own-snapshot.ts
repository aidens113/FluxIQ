import type { ProgramApiActor } from "../../../_shared/api.ts";
import type { IdentityAccessService } from "../../runtime/service.ts";
import type { IdentityAccessSnapshot } from "../../types.ts";

/**
 * What the `snapshot` endpoint lists in an instance whose people sign in
 * through `directory`: the caller alone, their role and their own sessions
 * (by digest), read there; no other person of the directory, who may belong
 * to another workspace. The vault is this instance's own.
 */
export async function ownSnapshot(service: IdentityAccessService, directory: IdentityAccessService, actor: ProgramApiActor): Promise<IdentityAccessSnapshot> {
  const [signIn, local] = await Promise.all([directory.snapshot(), service.snapshot()]);
  const users = signIn.users.filter((user) => user.id === actor.userId);
  const roleIds = new Set(users.map((user) => user.roleId));
  return {
    users,
    roles: signIn.roles.filter((role) => roleIds.has(role.id)),
    sessions: signIn.sessions.filter((session) => session.userId === actor.userId),
    vault: local.vault
  };
}
