import path from "node:path";
import type { JsonObject } from "../../../../core/index.ts";
import { SQLiteRepository } from "../../repository/sqlite-repository.ts";
import { ProgramJsonStore, ProgramStateReadError, type ProgramDocumentTransaction } from "../storage.ts";

export type ProgramJsonLockedDocument = { read: () => Promise<JsonObject | undefined>; write: (value: JsonObject) => Promise<void> };

/** One document's read/modify/write. Layout v2 uses its owning transaction; legacy JSON retains its atomic rename under a data-free per-document SQLite guard. */
export async function programJsonDocumentTransaction<T>(filePath: string, operation: (document: ProgramJsonLockedDocument) => Promise<T>): Promise<T> {
  const file = path.resolve(filePath);
  if (await ProgramJsonStore.existingOwningLayout(file)) return await ProgramJsonStore.transaction(file, async (transaction) => await operation(sqlDocument(file, transaction)));
  const guard = new SQLiteRepository({ rootDir: path.join(path.dirname(file), ".document-locks", `${path.basename(file)}.lock`), kind: "program.document_lock" });
  return await guard.transaction({}, async () => await operation(fileDocument(file)));
}

function fileDocument(file: string): ProgramJsonLockedDocument {
  return {
    read: async () => {
      let missing = false;
      const value = await new ProgramJsonStore<JsonObject>(file, () => {
        missing = true;
        return {};
      }).read();
      return missing ? undefined : value;
    },
    write: async (value) => { await new ProgramJsonStore<JsonObject>(file, () => ({})).write(value); }
  };
}

function sqlDocument(file: string, transaction: ProgramDocumentTransaction): ProgramJsonLockedDocument {
  return {
    read: async () => {
      let missing = false;
      let value: JsonObject;
      try {
        value = await transaction.read<JsonObject>(file, () => {
          missing = true;
          return {};
        });
      } catch (cause) {
        if (cause instanceof SyntaxError) throw new ProgramStateReadError(file, cause, false);
        throw cause;
      }
      if (missing) return undefined;
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProgramStateReadError(file, new Error("Expected object document data."), false);
      return value;
    },
    write: async (value) => { await transaction.write(file, value); }
  };
}
