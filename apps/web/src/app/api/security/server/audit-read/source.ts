import type { WorkspaceAccountReadContext } from "../../../../../lib/workspaces/account-reads";
import type { ActivitySource } from "../types";

/** Audit and people belong to one held primary authority and one exact selected workspace. */
export async function workspaceAuditSource(context: WorkspaceAccountReadContext): Promise<ActivitySource> {
  const workspaceId = context.workspaceId;
  const activeMember = async (userId: string) => {
    const membership = await context.store.getMembership(userId);
    return membership?.workspaceId === workspaceId && membership.userId === userId && membership.status === "active";
  };
  return {
    workspaceId,
    tenancy: context.tenancy,
    audit: await context.audit(),
    nameOf: async userId => {
      if (await activeMember(userId)) {
        const account = await context.store.getAccount(userId);
        if (account && account.userId === userId && account.status !== "deleted" && await activeMember(userId)) return account.displayName || account.email;
      }
      if (context.tenancy !== "single") return null;
      const user = (await context.identityAccess.snapshot()).users.find(candidate => candidate.id === userId);
      return user?.displayName ?? null;
    }
  };
}
