import { rm } from "node:fs/promises";
import { ProgramJsonStore } from "../../../../_shared/storage.ts";
import type { AutomationStudioObjectStore, AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

/**
 * Removes a deleted project's stored files: on the object-store layout its
 * documents from program state first, then, on either layout, its whole
 * directory. That directory holds `project.sqlite` (with every trace, chunk
 * and event), the content objects and the recording objects, so on the
 * object-store layout removing only the documents once left all of them on
 * disk after the project was gone (lane T P3-E2). Removing documents a
 * transaction already removed changes nothing, so a caller that deleted them
 * with its index write may call this after it commits.
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
  if (input.objectStore) await ProgramJsonStore.deletePath(input.projectDirectory);
  await input.pool?.closeIdleProject(input.projectId);
  await rm(input.projectDirectory, { recursive: true, force: true });
}
