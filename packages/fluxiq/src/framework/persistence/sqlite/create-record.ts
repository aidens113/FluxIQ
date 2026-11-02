import type { JsonObject } from "../../../core/index.ts";
import type { RecordEnvelope, RepositoryScope } from "../contracts/index.ts";
import { normalizeScope } from "./scope.ts";
import { safeKind } from "./kind.ts";

export function createRecord<T extends JsonObject>(params: {
  id: string;
  kind: string;
  data: T;
  scope?: RepositoryScope;
  nowMs?: number;
}): RecordEnvelope<T> {
  const now = params.nowMs ?? Date.now();
  return {
    id: params.id,
    kind: safeKind(params.kind),
    scope: normalizeScope(params.scope ?? {}),
    data: params.data,
    createdAtMs: now,
    updatedAtMs: now
  };
}
