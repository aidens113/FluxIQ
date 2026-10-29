// Who is told when a panel session is revoked, and with which id.
//
// Sessions are stored and looked up by digest (`../session-digest.ts`), but
// what holds state per session elsewhere -- Secret Keys' unlocks -- is keyed by
// the raw id, the cookie's bearer value. A sign-out names the raw id; an
// administrator's revoke by digest, `revokeUserSessions` or `deleteUser` reach
// sessions only by digest. So the raw id of every session this process minted
// or was presented is remembered here, in memory only and never stored, until
// the session is revoked or expires, and each listener is told that raw id when
// it is revoked, with who revoked it (`IdentitySessionRevoker`), so a listener
// can refuse a revoker it does not accept.
//
// A session whose raw id this process never saw cannot hold an unlock here:
// Secret Keys unlocks only a session the panel just signed in or validated in
// this process, which is exactly when its raw id was remembered.

import type { IdentitySessionRevocationListener, IdentitySessionRevoker } from "../../types.ts";

export class IdentitySessionRevocations {
  private readonly listeners = new Set<IdentitySessionRevocationListener>();
  private readonly rawIds = new Map<string, { sessionId: string; expiresAtMs: number }>();

  constructor(listeners: readonly IdentitySessionRevocationListener[] = []) {
    for (const listener of listeners) this.listeners.add(listener);
  }

  /** Adds a listener; the function returned removes it. */
  subscribe(listener: IdentitySessionRevocationListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Remembers a session's raw id under its digest, as minted or presented, and forgets every expired one. */
  remember(digest: string, sessionId: string, expiresAtMs: number, nowMs: number): void {
    for (const [held, entry] of this.rawIds) if (entry.expiresAtMs <= nowMs) this.rawIds.delete(held);
    if (expiresAtMs > nowMs) this.rawIds.set(digest, { sessionId, expiresAtMs });
  }

  /**
   * Forgets the revoked digests and tells every listener each raw id -- the
   * one the caller presented, and each one remembered for a digest -- with
   * `revoker`. A revoke nobody vouches for (no user, not an administrator) is
   * announced to no one. Every listener runs; a failure is thrown after, with
   * the session already revoked.
   */
  async revoked(digests: readonly string[], revoker: IdentitySessionRevoker, presented?: string): Promise<void> {
    const sessionIds = new Set<string>(presented ? [presented] : []);
    for (const digest of digests) {
      const entry = this.rawIds.get(digest);
      if (entry) sessionIds.add(entry.sessionId);
      this.rawIds.delete(digest);
    }
    if (revoker.userId === null && !revoker.administrator) return;
    const runs = [...sessionIds].flatMap((sessionId) => [...this.listeners].map(async (listener) => await listener(sessionId, revoker)));
    const failures = (await Promise.allSettled(runs)).flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (failures.length) throw new AggregateError(failures, "The session was revoked, but a session-revocation subscriber failed.");
  }
}
