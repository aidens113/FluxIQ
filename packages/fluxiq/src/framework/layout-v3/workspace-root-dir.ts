import path from "node:path";
import type { FluxIQLayoutV3Paths } from "./paths-type.ts";

const WORKSPACE_ID = /^[a-z0-9][a-z0-9-]{0,62}$/;

/** The workspace root of one tenant: a direct child of `workspacesDir`. Refuses any id provisioning cannot produce. */
export function fluxiqWorkspaceRootDir(paths: FluxIQLayoutV3Paths, workspaceId: string): string {
  if (typeof workspaceId !== "string" || !WORKSPACE_ID.test(workspaceId)) {
    throw new Error(`storage.workspace_id_invalid: ${JSON.stringify(String(workspaceId).slice(0, 80))} is not a workspace id`);
  }
  const root = path.join(paths.workspacesDir, workspaceId);
  if (path.dirname(root) !== paths.workspacesDir) {
    throw new Error(`storage.workspace_id_invalid: ${JSON.stringify(workspaceId)} does not name a direct child of the workspaces directory`);
  }
  return root;
}
