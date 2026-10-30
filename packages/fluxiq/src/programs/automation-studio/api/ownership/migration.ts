import { AutomationStudioProjectOwnerRecordSet as RecordSet } from "./owner-records.ts";
import type { AutomationStudioProjectOwnerMigrationResult, AutomationStudioProjectOwnerStore } from "./types.ts";

export type AutomationStudioProjectOwnerMigrationInput = {
  store: AutomationStudioProjectOwnerStore;
  /** Ids already known to be projects; an unusable id is skipped and not counted. */
  projectIds: readonly string[];
  /** Asked at most once, and only when some project has no recorded owner. */
  defaultOwner: () => Promise<string | null>;
  now?: () => number;
};

/**
 * Gives every project in `projectIds` without a recorded owner the default
 * owner (`default-owner.ts`). Idempotent: a recorded owner, creator or
 * default, is never overwritten, and a second pass assigns nothing. The
 * unowned are re-read inside the store's atomic change, so a creator recorded
 * between the first read and the write is kept. With no default owner nothing
 * is written and the unowned are counted `unassigned`.
 */
export async function migrateAutomationStudioProjectOwners(input: AutomationStudioProjectOwnerMigrationInput): Promise<AutomationStudioProjectOwnerMigrationResult> {
  const projectIds = [...new Set(input.projectIds.filter((projectId) => RecordSet.isUsableId(projectId)))];
  const recorded = await input.store.read();
  const owners = new Map<string, string | null>();
  for (const projectId of projectIds) owners.set(projectId, RecordSet.of(recorded, projectId)?.userId ?? null);
  const unowned = projectIds.filter((projectId) => owners.get(projectId) === null);
  if (unowned.length === 0) return { examined: projectIds.length, alreadyOwned: projectIds.length, assigned: 0, unassigned: 0, defaultOwner: null, owners };
  const defaultOwner = await input.defaultOwner();
  if (defaultOwner === null) return { examined: projectIds.length, alreadyOwned: projectIds.length - unowned.length, assigned: 0, unassigned: unowned.length, defaultOwner, owners };
  const recordedAt = (input.now ?? Date.now)();
  const assigned = await input.store.change((records) => {
    let count = 0;
    for (const projectId of unowned) {
      const current = RecordSet.of(records, projectId);
      if (current) {
        owners.set(projectId, current.userId);
        continue;
      }
      records[projectId] = { userId: defaultOwner, source: "default", recordedAt };
      owners.set(projectId, defaultOwner);
      count += 1;
    }
    return count;
  });
  return { examined: projectIds.length, alreadyOwned: projectIds.length - assigned, assigned, unassigned: 0, defaultOwner, owners };
}
