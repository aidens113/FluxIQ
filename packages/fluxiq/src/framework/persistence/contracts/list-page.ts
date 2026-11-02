import type { JsonObject } from "../../../core/index.ts";
import type { RecordEnvelope } from "./record-envelope.ts";

export type RepositoryListPage<T extends JsonObject = JsonObject> = {
  records: Array<RecordEnvelope<T>>;
  total: number;
  limit: number;
  offset: number;
};
