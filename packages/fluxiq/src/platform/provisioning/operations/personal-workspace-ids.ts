import type { ProvisioningContext } from "../context/index.ts";

/** The ids of the personal workspaces an account owns: what deleting it deletes. Organisation and single workspaces only lose the membership. */
export async function personalWorkspaceIds(context: ProvisioningContext, userId: string): Promise<string[]> {
  const workspaces = await context.store.listWorkspaces();
  return workspaces.filter((workspace) => workspace.kind === "personal" && workspace.ownerUserId === userId).map((workspace) => workspace.workspaceId);
}
