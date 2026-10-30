import { ProgramJsonStore } from "../../../_shared/storage.ts";
import { AutomationStudioProjectOwnerRecordSet as RecordSet } from "./owner-records.ts";
import type { AutomationStudioProjectOwnerRecords, AutomationStudioProjectOwnerStore } from "./types.ts";

// Owner records as one program-state document, `{ projects: { <id>: record } }`.
//
// Under FluxIQ storage layout v2 the path maps to a row of the storage owner's
// SQLite state, and every change is one SQLite transaction, so two processes
// sharing the store cannot lose each other's writes. Otherwise it is a JSON
// file, changed under `ProgramJsonStore`'s per-file lock and replaced by an
// atomic rename: safe within one process, as every file-backed program-state
// document is.

type OwnerDocument = { projects: AutomationStudioProjectOwnerRecords };

export class AutomationStudioProjectOwnerDocumentStore implements AutomationStudioProjectOwnerStore {
  private readonly document: ProgramJsonStore<OwnerDocument>;

  constructor(filePath: string) {
    this.document = new ProgramJsonStore<OwnerDocument>(filePath, emptyDocument);
  }

  get filePath(): string {
    return this.document.filePath;
  }

  async read(): Promise<AutomationStudioProjectOwnerRecords> {
    return RecordSet.parse(await this.document.read());
  }

  async change<T>(mutate: (records: AutomationStudioProjectOwnerRecords) => T): Promise<T> {
    if (this.document.isFileBacked()) {
      let result: { value: T } | undefined;
      await this.document.update((stored) => {
        const records = RecordSet.parse(stored);
        result = { value: mutate(records) };
        return { projects: records };
      });
      if (!result) throw new Error("Automation Studio project owner change did not run.");
      return result.value;
    }
    const filePath = this.document.filePath;
    return await ProgramJsonStore.transaction(filePath, async (transaction) => {
      const records = RecordSet.parse(await transaction.read<OwnerDocument>(filePath, emptyDocument));
      const result = mutate(records);
      await transaction.write<OwnerDocument>(filePath, { projects: records });
      return result;
    });
  }
}

function emptyDocument(): OwnerDocument {
  return { projects: {} };
}
