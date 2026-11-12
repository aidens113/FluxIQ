import type { JsonObject } from "../../../../core/index.ts";
import { AutomationStudioProjectDatasetSnapshotStore, type AutomationStudioProjectDatabasePool } from "../../../persistence/automation/index.ts";
import type { AutomationStudioProjectStore } from "../projects/index.ts";

/** Internal source-snapshot API; project data remains in the project's own database. */
export class AutomationStudioDatasetSnapshots {
  constructor(private readonly projects: AutomationStudioProjectStore, private readonly pool: AutomationStudioProjectDatabasePool | undefined) {}

  create(input: { projectId: string; rows: readonly { occurrenceId: string; row: JsonObject }[] }) {
    return this.withStore(input.projectId, (store) => store.create(input.rows));
  }

  page(input: { projectId: string; snapshotId: string; cursor?: string; limit?: number }) {
    return this.withStore(input.projectId, (store) => store.page(input));
  }

  private async withStore<T>(projectId: string, action: (store: AutomationStudioProjectDatasetSnapshotStore) => Promise<T>): Promise<T> {
    if (!this.pool) throw new Error("Dataset snapshots require project storage.");
    await this.projects.findProjectSummary(projectId);
    const store = await AutomationStudioProjectDatasetSnapshotStore.open({ pool: this.pool, projectId });
    try { return await action(store); } finally { await store.close(); }
  }
}
