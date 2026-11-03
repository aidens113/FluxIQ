import type { JsonObject } from "../../../../../core/index.ts";
import type { RecordEnvelope, RepositoryScope } from "../../../contracts/index.ts";
import type { SQLiteNativeObservation } from "../native/index.ts";

/** Constructor-pinned original native body, never a supplied Repository adapter. */
export interface SQLiteRepositoryOperations<T extends JsonObject> {
  assert(): void;
  list(scope: RepositoryScope, native: SQLiteNativeObservation): Promise<RecordEnvelope<T>[]>;
  put(record: RecordEnvelope<T>, native: SQLiteNativeObservation): Promise<RecordEnvelope<T>>;
}
