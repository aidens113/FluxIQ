import { iamPrincipalFrn } from "../../iam/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/**
 * A user's principal FRN in the workspace it acts in: the one workspace under
 * single tenancy, else its first active membership's; null when it has none.
 */
export async function userPrincipalFrn(context: ProvisioningContext, userId: string): Promise<string | null> {
  if (context.tenancy.mode === "single") return iamPrincipalFrn("user", context.tenancy.workspaceId, userId);
  const memberships = await context.store.listMembershipsOfUser(userId);
  const active = memberships.find((membership) => membership.status === "active");
  return active === undefined ? null : iamPrincipalFrn("user", active.workspaceId, userId);
}
