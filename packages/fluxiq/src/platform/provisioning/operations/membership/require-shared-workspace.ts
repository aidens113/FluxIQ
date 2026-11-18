import type { PlatformWorkspaceRecord } from "../../../store/index.ts";
import { ProvisioningRefusal } from "../../context/index.ts";
import type { ProvisioningContext } from "../../context/index.ts";

/**
 * The workspace one membership operation acts on: an organisation or single
 * workspace, or `not_found`. A personal workspace belongs to its owner alone,
 * who leaves it by deleting the account, so its membership is never
 * suspended or removed on its own.
 */
export async function requireSharedWorkspace(context: ProvisioningContext, workspaceId: string): Promise<PlatformWorkspaceRecord> {
  const workspace = await context.store.getWorkspace(workspaceId);
  if (workspace === null || workspace.kind === "personal") throw new ProvisioningRefusal("not_found", "No such shared workspace.");
  return workspace;
}
