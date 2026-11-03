import type { AutomationStudioProjectOwnerRecords, AutomationStudioProjectOwnerStore } from "./types.ts";

// Owner records for a service with no storage root, kept for the store's own
// lifetime; such a service keeps its projects in memory too. `change` is
// atomic because its mutation runs synchronously on a copy that replaces the
// records only when it returns.

export class AutomationStudioProjectOwnerMemoryStore implements AutomationStudioProjectOwnerStore {
  private records: AutomationStudioProjectOwnerRecords = {};

  async read(): Promise<AutomationStudioProjectOwnerRecords> {
    return structuredClone(this.records);
  }

  async change<T>(mutate: (records: AutomationStudioProjectOwnerRecords) => T): Promise<T> {
    const next = structuredClone(this.records);
    const result = mutate(next);
    this.records = next;
    return result;
  }
}
