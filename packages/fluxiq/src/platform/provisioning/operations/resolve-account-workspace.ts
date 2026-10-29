import { ProvisioningRefusal } from "../context/index.ts";
import type { ProvisioningContext } from "../context/index.ts";

/** Where a new account becomes a member: a personal workspace to create, or an existing workspace. */
export type AccountWorkspaceTarget = { kind: "new-personal" } | { kind: "existing"; workspaceId: string };

/**
 * Resolves `createAccount`'s `workspace`.
 *
 * - Single tenancy: `"new"` and the one workspace's id both mean the one
 *   workspace; any other id is `not_found`.
 * - Multi tenancy: `"new"` is a new personal workspace; an id must name an
 *   organisation workspace (`not_found` otherwise, personal ones included),
 *   and organisation membership needs the `iam.organisation` entitlement.
 */
export async function resolveAccountWorkspace(context: ProvisioningContext, workspace: string): Promise<AccountWorkspaceTarget> {
  if (context.tenancy.mode === "single") {
    if (workspace === "new" || workspace === context.tenancy.workspaceId) return { kind: "existing", workspaceId: context.tenancy.workspaceId };
    throw new ProvisioningRefusal("not_found", "No such workspace.");
  }
  if (workspace === "new") return { kind: "new-personal" };
  const record = await context.store.getWorkspace(workspace);
  if (record === null || record.kind !== "organisation") throw new ProvisioningRefusal("not_found", "No such organisation workspace.");
  if (!context.organisationEntitled) throw new ProvisioningRefusal("entitlement_required", "Organisation workspaces need the iam.organisation entitlement.");
  return { kind: "existing", workspaceId: record.workspaceId };
}
