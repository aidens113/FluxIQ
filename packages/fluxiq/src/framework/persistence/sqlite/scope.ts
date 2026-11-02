import type { RepositoryScope } from "../contracts/index.ts";

export function normalizeScope(scope: RepositoryScope): RepositoryScope {
  const domainId = scope.domainId?.trim().toLowerCase();
  return domainId ? { domainId } : {};
}
