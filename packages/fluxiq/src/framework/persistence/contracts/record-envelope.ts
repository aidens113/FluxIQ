import type { JsonObject } from "../../../core/index.ts";
import type { RepositoryScope } from "./scope.ts";

export type RecordEnvelope<T extends JsonObject = JsonObject> = {
  id: string;
  scope: RepositoryScope;
  kind: string;
  data: T;
  createdAtMs: number;
  updatedAtMs: number;
};
