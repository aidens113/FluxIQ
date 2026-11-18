import type { JsonObject } from "../../../core/index.ts";
import { ProgramJsonStore, programDataFile } from "../../../framework/persistence/program-state/storage.ts";
import type { AutomationStudioModelAccessLedgerPersistence } from "../../../runtime/models/secrets/index.ts";

/**
 * Where an instance keeps how each key's last model call or free check went,
 * so a refused or empty key still reads that way after a restart (t928): one
 * program-state file under the instance's data directory. It holds key ids,
 * value versions, outcomes, times and the provider's own failure words, never
 * a key's value. The ledger validates what it reads back, and a write that
 * fails only leaves the in-memory reading.
 */
export function modelAccessLedgerStore(dataDir: string): AutomationStudioModelAccessLedgerPersistence {
  const store = new ProgramJsonStore<JsonObject>(programDataFile(dataDir, "secret-keys", "model-access-ledger.json"), () => ({ entries: [] }));
  return {
    read: async () => (await store.read()).entries,
    write: async (entries) => {
      await store.write({ entries: entries as unknown as JsonObject[] });
    }
  };
}
