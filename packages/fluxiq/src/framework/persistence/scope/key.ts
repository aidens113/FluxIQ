import type { RepositoryScope } from "../contracts/index.ts";
import { normalizeScope } from "./normalize.ts";

export function scopeKey(scope: RepositoryScope = {}): string {
  return normalizeScope(scope).domainId ?? "global";
}
