import type { JsonObject } from "../../../../../core/index.ts";
import { ProgramJsonStore, safeSegment } from "../../../../_shared/storage.ts";
import type { AutomationStudioRuntimeSession } from "../../../model/index.ts";
import { upsertBy } from "../collections.ts";
import type { RuntimeIndex } from "../indexes/index.ts";
import type { AutomationStudioProjectPaths } from "../paths/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";

/** Where a project's run sessions are kept. */
export type AutomationStudioRuntimeSessionFileStores = {
  projects: Pick<AutomationStudioProjectStore, "ensureProjectStructure">;
  projectPaths: Pick<AutomationStudioProjectPaths, "projectFile">;
};

/**
 * Writes a run's session file and its row in the project's session index
 * (`runtime/sessions/<run>.json`, `runtime/indexes/sessions.json`). The run's
 * summary and detail are the caller's to write after it.
 */
export async function writeAutomationStudioRuntimeSessionFiles(stores: AutomationStudioRuntimeSessionFileStores, projectId: string, session: AutomationStudioRuntimeSession): Promise<void> {
  await stores.projects.ensureProjectStructure(projectId);
  await new ProgramJsonStore<JsonObject>(stores.projectPaths.projectFile(projectId, "runtime", "sessions", `${safeSegment(session.runId)}.json`), () => ({})).write({ session: session as unknown as JsonObject });
  await new ProgramJsonStore<RuntimeIndex>(stores.projectPaths.projectFile(projectId, "runtime", "indexes", "sessions.json"), () => ({ sessions: [] })).update((index) => ({
    sessions: upsertBy(index.sessions ?? [], "runId", {
      runId: session.runId,
      targetKind: session.targetKind,
      targetId: session.targetId,
      status: session.status,
      updatedAt: Date.now()
    })
  }));
}
