// Removing sessions by digest, from memory and from the store together:
// deleted from memory alone, the next reload would bring a session back.

import type { Repository } from "../../../database-manager/index.ts";
import type { StoredSession } from "../stored-state.ts";

/** Deletes each digest's session from `sessions` and its `session:<digest>` record; the count is how many existed in either. */
export async function deleteStoredSessions(sessions: Map<string, StoredSession>, repository: Repository | undefined, digests: readonly string[]): Promise<number> {
  let removed = 0;
  for (const digest of digests) {
    const held = sessions.delete(digest);
    const stored = (await repository?.delete(`session:${digest}`, {})) ?? false;
    if (held || stored) removed += 1;
  }
  return removed;
}
