import { lstat, rm } from "node:fs/promises";
import path from "node:path";
import type { FluxIQLayoutV3Paths } from "./paths-type.ts";
import { fluxiqWorkspaceRootDir } from "./workspace-root-dir.ts";

/** Deletes one workspace root. False when it is absent; refuses anything that is not a direct child of `workspacesDir`. */
export async function removeFluxIQWorkspaceRoot(paths: FluxIQLayoutV3Paths, workspaceId: string): Promise<boolean> {
  const root = fluxiqWorkspaceRootDir(paths, workspaceId);
  if (path.dirname(root) !== paths.workspacesDir) {
    throw new Error("storage.workspace_root_outside: refusing to remove a path that is not a workspace root");
  }
  try {
    await lstat(root);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
  await rm(root, { recursive: true, force: true });
  return true;
}
