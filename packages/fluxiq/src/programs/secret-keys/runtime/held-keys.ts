import type { SecretKeyCredentialHolderKind } from "../types.ts";

/** The longest delay `setTimeout` can count: anything longer fires at once. A 30-day credential is longer. */
const MAX_TIMER_DELAY_MS = 2_147_483_647;

export type SecretRevealAuthorizationMetadata = {
  authorizationId: string;
  keyId: string;
  keyUpdatedAtMs: number;
  expiresAtMs: number;
  remainingUses: 1;
};

/** A one-use reveal authorization and the key that opens its record. */
export type HeldRevealAuthorization = SecretRevealAuthorizationMetadata & {
  decryptionKey: Buffer;
  sessionId?: string;
  state: "available" | "claimed";
  expiryTimer: ReturnType<typeof setTimeout>;
};

/** A session's unlocked keys, by record id. */
export type HeldSessionUnlock = {
  sessionId: string;
  userId: string;
  expiresAtMs: number;
  /** Set when it came from a stored credential unlock (`./unlocks/`). A paired client's unlock is its own: no other caller falls back to it. */
  credentialHolder?: SecretKeyCredentialHolderKind | undefined;
  decryptionKeys: Map<string, { keyUpdatedAtMs: number; decryptionKey: Buffer }>;
  expiryTimer: ReturnType<typeof setTimeout>;
};

/**
 * Custody of password-derived keys held after a successful check: session
 * unlocks and one-use reveal authorizations. Invariant: every held key opens its
 * record's current seal. Rotation, metadata edits, and deletion revoke a key's
 * holders; a re-seal or credential change replaces their keys. Every buffer
 * dropped or replaced is zeroed.
 *
 * A `SecretKeysService` creates its own, or is given one that outlives it (a
 * workspace manager's, so evicting an idle instance does not lock its users'
 * keys). Expiry timers come from here and hold only this custody and an id,
 * never the service that asked for them or the password that unlocked them.
 */
export class HeldKeys {
  private readonly authorizations = new Map<string, HeldRevealAuthorization>();
  private readonly sessions = new Map<string, HeldSessionUnlock>();
  private readonly changeWaiters = new Map<string, Set<() => void>>();

  /** An unreferenced timer that revokes `sessionId`'s unlock after `delayMs`. */
  sessionExpiryTimer(sessionId: string, delayMs: number): ReturnType<typeof setTimeout> {
    // Past what one timer can count, it counts the rest in stretches: a 60-day credential's unlock stays held for its whole life.
    const timer = setTimeout(() => {
      const unlock = delayMs > MAX_TIMER_DELAY_MS ? this.sessions.get(sessionId) : undefined;
      if (unlock) unlock.expiryTimer = this.sessionExpiryTimer(sessionId, delayMs - MAX_TIMER_DELAY_MS);
      else this.revokeSession(sessionId);
    }, Math.min(delayMs, MAX_TIMER_DELAY_MS));
    timer.unref?.();
    return timer;
  }

  /** An unreferenced timer that revokes `authorizationId` after `delayMs`. */
  authorizationExpiryTimer(authorizationId: string, delayMs: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => this.revokeAuthorization(authorizationId), delayMs);
    timer.unref?.();
    return timer;
  }

  authorization(authorizationId: string): HeldRevealAuthorization | undefined {
    return this.authorizations.get(authorizationId);
  }

  session(sessionId: string): HeldSessionUnlock | undefined {
    return this.sessions.get(sessionId);
  }

  /** The sessions held for one user, as ids, expiries and how many keys each opens; no key material. A paired client's own unlock is not among them. */
  sessionsFor(userId: string): Array<{ sessionId: string; expiresAtMs: number; keyCount: number }> {
    const held: Array<{ sessionId: string; expiresAtMs: number; keyCount: number }> = [];
    for (const unlock of this.sessions.values()) {
      if (unlock.userId === userId && unlock.credentialHolder !== "paired-client") held.push({ sessionId: unlock.sessionId, expiresAtMs: unlock.expiresAtMs, keyCount: unlock.decryptionKeys.size });
    }
    return held;
  }

  /** One user's unexpired unlocks, with their keys, for custody's own use. */
  liveUnlocksFor(userId: string, nowMs: number): HeldSessionUnlock[] {
    return [...this.sessions.values()].filter((unlock) => unlock.userId === userId && unlock.expiresAtMs > nowMs);
  }

  /** Resolves when something this person holds changes, or when `signal` aborts. */
  whenChanged(userId: string, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.resolve();
    return new Promise<void>((resolve) => {
      const waiters = this.changeWaiters.get(userId) ?? new Set<() => void>();
      const settle = () => {
        waiters.delete(settle);
        if (waiters.size === 0 && this.changeWaiters.get(userId) === waiters) this.changeWaiters.delete(userId);
        signal?.removeEventListener("abort", settle);
        resolve();
      };
      waiters.add(settle);
      this.changeWaiters.set(userId, waiters);
      signal?.addEventListener("abort", settle, { once: true });
    });
  }

  /** Wakes everything waiting on this person's keys, so it looks again. */
  notifyChanged(userId: string): void {
    for (const settle of [...(this.changeWaiters.get(userId) ?? [])]) settle();
  }

  /** A held unlock's life slid: what it holds is untouched, so a call in flight is not cut. */
  extendSession(sessionId: string, expiresAtMs: number, delayMs: number): void {
    const unlock = this.sessions.get(sessionId);
    if (!unlock) return;
    clearTimeout(unlock.expiryTimer);
    unlock.expiresAtMs = expiresAtMs;
    unlock.expiryTimer = this.sessionExpiryTimer(sessionId, delayMs);
  }

  holdAuthorization(authorization: HeldRevealAuthorization): void {
    this.authorizations.set(authorization.authorizationId, authorization);
  }

  holdSession(unlock: HeldSessionUnlock): void {
    this.sessions.set(unlock.sessionId, unlock);
  }

  authorizationCount(): number {
    return this.authorizations.size;
  }

  sessionCount(): number {
    return this.sessions.size;
  }

  revokeAuthorization(authorizationId: string): void {
    const authorization = this.authorizations.get(authorizationId);
    if (!authorization) return;
    clearTimeout(authorization.expiryTimer);
    authorization.decryptionKey.fill(0);
    this.authorizations.delete(authorizationId);
  }

  /** Revokes a session's unlock and every reveal authorization issued from it. */
  revokeSession(sessionId: string): void {
    const unlock = this.sessions.get(sessionId);
    if (unlock) {
      clearTimeout(unlock.expiryTimer);
      for (const entry of unlock.decryptionKeys.values()) entry.decryptionKey.fill(0);
      unlock.decryptionKeys.clear();
      this.sessions.delete(sessionId);
    }
    for (const authorization of [...this.authorizations.values()]) {
      if (authorization.sessionId === sessionId) this.revokeAuthorization(authorization.authorizationId);
    }
  }

  /** Revokes every holder of a record's key. */
  revokeKey(keyId: string): void {
    for (const authorization of [...this.authorizations.values()]) {
      if (authorization.keyId === keyId) this.revokeAuthorization(authorization.authorizationId);
    }
    for (const unlock of this.sessions.values()) {
      const entry = unlock.decryptionKeys.get(keyId);
      if (!entry) continue;
      entry.decryptionKey.fill(0);
      unlock.decryptionKeys.delete(keyId);
    }
  }

  /**
   * Gives every holder of a record's key a copy of `nextKey`, zeroing the old
   * buffers. With `keepUserId`, only that user's sessions and their reveal
   * authorizations keep the key; every other holder is revoked.
   */
  replaceKey(keyId: string, nextKey: Buffer, keepUserId?: string): void {
    for (const unlock of this.sessions.values()) {
      const held = unlock.decryptionKeys.get(keyId);
      if (!held) continue;
      held.decryptionKey.fill(0);
      if (keepUserId === undefined || unlock.userId === keepUserId) held.decryptionKey = Buffer.from(nextKey);
      else unlock.decryptionKeys.delete(keyId);
    }
    for (const authorization of [...this.authorizations.values()]) {
      if (authorization.keyId !== keyId) continue;
      const ownerUserId = authorization.sessionId === undefined ? undefined : this.sessions.get(authorization.sessionId)?.userId;
      if (keepUserId !== undefined && ownerUserId !== keepUserId) {
        this.revokeAuthorization(authorization.authorizationId);
        continue;
      }
      authorization.decryptionKey.fill(0);
      authorization.decryptionKey = Buffer.from(nextKey);
    }
  }

  revokeAll(): void {
    for (const authorizationId of [...this.authorizations.keys()]) this.revokeAuthorization(authorizationId);
    for (const sessionId of [...this.sessions.keys()]) this.revokeSession(sessionId);
  }
}
