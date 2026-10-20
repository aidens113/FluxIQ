// Test support for keyed content-store object addresses: a protected content
// store on its own pool, direct SQL on its project database, and a walk of
// every file under a project directory for leak probes.
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { AutomationStudioProjectContentStore } from "../../content-store.ts";
import type { AutomationStudioProjectContentProtection } from "../../content-protection.ts";
import { AutomationStudioProjectDatabasePool } from "../../database.ts";
import type { AutomationStudioProjectDatabase } from "../../database.ts";
import type { AutomationStudioContentObjectAddressBackfillOptions } from "../index.ts";

export type ObjectAddressRow = { objectId: string; mediaType: string; encryption: string | null; relativePath: string; contentAddress: string | null; contentAddressKeyId: string | null };

export type OpenedStore = {
  pool: AutomationStudioProjectDatabasePool;
  store: AutomationStudioProjectContentStore;
  close(): Promise<void>;
};

export async function openStore(input: { rootDir: string; projectId: string; protection?: AutomationStudioProjectContentProtection; backfill?: AutomationStudioContentObjectAddressBackfillOptions }): Promise<OpenedStore> {
  const pool = new AutomationStudioProjectDatabasePool({ rootDir: input.rootDir });
  let store: AutomationStudioProjectContentStore;
  try {
    store = await AutomationStudioProjectContentStore.open({
      pool,
      projectId: input.projectId,
      ...(input.protection ? { protection: input.protection } : {}),
      ...(input.backfill ? { contentAddressBackfill: input.backfill } : {})
    });
  } catch (error) {
    // A refused open still leaves the pool's connection open; close it so the temp root can be removed.
    await pool.closeAll();
    throw error;
  }
  return {
    pool,
    store,
    close: async () => {
      await store.close();
      await pool.closeAll();
    }
  };
}

/** Runs `operation` against the project database held by `pool`. */
export async function withDatabase<T>(pool: AutomationStudioProjectDatabasePool, projectId: string, operation: (database: AutomationStudioProjectDatabase) => Promise<T>): Promise<T> {
  const lease = await pool.acquire(projectId);
  try {
    return await operation(lease.database);
  } finally {
    await lease.release();
  }
}

export async function objectRows(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<ObjectAddressRow[]> {
  return withDatabase(pool, projectId, (database) => database.all<ObjectAddressRow>(
    `select object_id as objectId, media_type as mediaType, encryption, relative_path as relativePath,
       content_address as contentAddress, content_address_key_id as contentAddressKeyId
     from objects order by created_at_ms, object_id`
  ));
}

export async function referenceCount(pool: AutomationStudioProjectDatabasePool, projectId: string, objectId: string): Promise<number> {
  const row = await withDatabase(pool, projectId, (database) => database.get<{ count: number }>("select count(*) as count from object_references where object_id = ?", [objectId]));
  return row?.count ?? 0;
}

/** Clears the content address of every sealed row, as a project written before 0033 would hold them. */
export async function clearSealedAddresses(pool: AutomationStudioProjectDatabasePool, projectId: string): Promise<void> {
  await withDatabase(pool, projectId, (database) => database.run("update objects set content_address = null, content_address_key_id = null where encryption is not null"));
}

/** Every file under `dir`, recursively. */
export async function filesUnder(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(target));
    else files.push(target);
  }
  return files;
}

/** The files under `dir` whose bytes contain any of `needles`. */
export async function filesContaining(dir: string, needles: readonly Buffer[]): Promise<string[]> {
  const hits: string[] = [];
  for (const file of await filesUnder(dir)) {
    const bytes = await readFile(file);
    if (needles.some((needle) => bytes.includes(needle))) hits.push(file);
  }
  return hits;
}
