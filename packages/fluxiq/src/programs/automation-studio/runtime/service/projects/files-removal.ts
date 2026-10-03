import { rm } from "node:fs/promises";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioObjectStore, AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

/**
 * Removes a deleted project's stored files: its documents from the object
 * store's program state, or, on a folder layout, its whole directory.
 *
 * The service's pool keeps an idle project's database connection open for a
 * moment after each operation (t246), and an open connection holds
 * `project.sqlite` and its WAL, which Windows will not delete. The directory is
 * removed only after that connection is closed.
 */
export async function removeAutomationStudioProjectFiles(input: {
  objectStore: AutomationStudioObjectStore | undefined;
  pool: AutomationStudioProjectDatabasePool | undefined;
  projectId: string;
  projectDirectory: string;
}): Promise<void> {
  if (input.objectStore) {
    await ProgramJsonStore.deletePath(input.projectDirectory);
    return;
  }
  await input.pool?.closeIdleProject(input.projectId);
  await rm(input.projectDirectory, { recursive: true, force: true });
}
