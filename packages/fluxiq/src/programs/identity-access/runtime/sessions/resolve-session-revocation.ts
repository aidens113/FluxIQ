// Who may revoke a panel session, and who the revoke is announced as.
//
// A session is named by its raw id (a sign-out presents its own cookie) or, by
// an administrator only, by the digest the panel lists (`snapshot`), so no raw
// id ever has to leave the server. A revoker who is not an administrator may
// revoke only a session of their own. With no revoker, the presenter of a raw
// id is taken to be its bearer, and the revoke is announced as the session's
// own user; when the session is unknown here, nobody vouches for it.

import type { IdentitySessionRevoker, IdentitySessionTarget } from "../../types.ts";
import { digestSessionId } from "../session-digest.ts";
import type { StoredSession } from "../stored-state.ts";

const SESSION_DIGEST = /^[0-9a-f]{64}$/u;

/** The digest to revoke, the raw id presented (if any), and the revoker listeners are told; throws on a refused revoke. */
export function resolveSessionRevocation(
  sessions: ReadonlyMap<string, StoredSession>,
  target: IdentitySessionTarget,
  revoker: IdentitySessionRevoker | undefined
): { digest: string; presented: string | undefined; revoker: IdentitySessionRevoker } {
  const presented = typeof target === "string" ? target : undefined;
  const digest = presented === undefined ? (target as { digest: string }).digest : digestSessionId(presented);
  if (presented === undefined && (revoker?.administrator !== true || !SESSION_DIGEST.test(digest))) {
    throw new Error("Only an administrator can revoke a session by its digest");
  }
  const ownerUserId = sessions.get(digest)?.userId ?? null;
  if (revoker && !revoker.administrator && (revoker.userId === null || revoker.userId !== ownerUserId)) {
    throw new Error("Only the session's own user or an administrator can revoke it");
  }
  return { digest, presented, revoker: revoker ?? { userId: ownerUserId, administrator: false } };
}
