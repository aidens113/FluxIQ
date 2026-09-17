import { AutomationStudioProjectRuntimeStreamStore, type AutomationStudioProjectDatabasePool } from "../../../storage/index.ts";

/** What decides whether the service has a typed runtime store at all. */
export type AutomationStudioRuntimeStreamStoreAccess = {
  pool: AutomationStudioProjectDatabasePool | undefined;
  root: string | undefined;
};

/**
 * Runs `operation` against the project's typed runtime store and closes it.
 *
 * `null` means only that the service has no typed store: no project database
 * pool, or no storage root. Once one is configured, a store that cannot be
 * opened and an operation that fails are both errors for the caller. The
 * summary store's `tryWithRuntimeStreamStore` answers `null` for those too,
 * which a reader cannot tell apart from "nothing stored".
 */
export async function withConfiguredRuntimeStreamStore<T>(
  access: AutomationStudioRuntimeStreamStoreAccess,
  projectId: string,
  operation: (store: AutomationStudioProjectRuntimeStreamStore) => Promise<T>
): Promise<T | null> {
  if (!access.pool || !access.root) return null;
  const store = await AutomationStudioProjectRuntimeStreamStore.open({ pool: access.pool, projectId });
  try {
    return await operation(store);
  } finally {
    await store.close();
  }
}
