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
  readonly #native = Object.freeze({ authorizations: this.authorizations, sessions: this.sessions });

  static owns(original: object): boolean {
    return #native in original;
  }

  /** Drop only this exact owner-created grant, never another row sharing its id. */
  static revokeOwnedAuthorization(original: HeldKeys, authorization: HeldRevealAuthorization, cancel: typeof clearTimeout): void {
    if (#native in original && original.#native.authorizations.get(authorization.authorizationId) === authorization) {
      original.#revokeAuthorizationWith(authorization.authorizationId, cancel);
      return;
    }
    authorization.state = "claimed";
    cancel(authorization.expiryTimer);
    authorization.decryptionKey.fill(0);
  }

  static revokeOwnedSession(original: HeldKeys, unlock: HeldSessionUnlock, cancel: typeof clearTimeout): void {
    if (!(#native in original) || original.#native.sessions.get(unlock.sessionId) !== unlock) return;
    original.#revokeSessionWith(unlock.sessionId, id => original.#revokeAuthorizationWith(id, cancel), cancel);
  }

  static ownedAuthorizationTimer(original: HeldKeys, id: string, delay: number, start: typeof setTimeout, cancel: typeof clearTimeout): ReturnType<typeof setTimeout> {
    if (!(#native in original) || start !== nativeStartTimer || cancel !== nativeCancelTimer) throw new Error("secret.execution.timer_unverified");
    return original.#startExpiry(() => original.#revokeAuthorizationWith(id, cancel), delay, start);
  }

  #startExpiry(expire: () => void, delay: number, start: typeof setTimeout): ReturnType<typeof setTimeout> {
    const timer = start(expire, delay);
    timer.unref?.();
    return timer;
  }

  /** An unreferenced timer that revokes `sessionId`'s unlock after `delayMs`. */
  sessionExpiryTimer(sessionId: string, delayMs: number): ReturnType<typeof setTimeout> {
    const revoke = this.revokeSession;
    const revokeAuthorization = this.revokeAuthorization;
    const cancel = clearTimeout;
    const drop = revokeAuthorization === nativeRevokeAuthorization ? (id: string) => this.#revokeAuthorizationWith(id, cancel) : revokeAuthorization.bind(this);
    return this.#startExpiry(() => revoke === nativeRevokeSession ? this.#revokeSessionWith(sessionId, drop, cancel) : revoke.call(this, sessionId), delayMs, setTimeout);
  }

  /** An unreferenced timer that revokes `authorizationId` after `delayMs`. */
  authorizationExpiryTimer(authorizationId: string, delayMs: number): ReturnType<typeof setTimeout> {
    const revoke = this.revokeAuthorization;
    const cancel = clearTimeout;
    return this.#startExpiry(() => revoke === nativeRevokeAuthorization ? this.#revokeAuthorizationWith(authorizationId, cancel) : revoke.call(this, authorizationId), delayMs, setTimeout);
  }

  authorization(authorizationId: string): HeldRevealAuthorization | undefined {
    return this.#native.authorizations.get(authorizationId);
  }

  session(sessionId: string): HeldSessionUnlock | undefined {
    return this.#native.sessions.get(sessionId);
  }

  /** The sessions held for one user, as ids, expiries and how many keys each opens; no key material. */
  sessionsFor(userId: string): Array<{ sessionId: string; expiresAtMs: number; keyCount: number }> {
    const held: Array<{ sessionId: string; expiresAtMs: number; keyCount: number }> = [];
    for (const unlock of this.#native.sessions.values()) {
      if (unlock.userId === userId) held.push({ sessionId: unlock.sessionId, expiresAtMs: unlock.expiresAtMs, keyCount: unlock.decryptionKeys.size });
    }
    return held;
  }

  holdAuthorization(authorization: HeldRevealAuthorization): void {
    this.#native.authorizations.set(authorization.authorizationId, authorization);
  }

  holdSession(unlock: HeldSessionUnlock): void {
    this.#native.sessions.set(unlock.sessionId, unlock);
  }

  authorizationCount(): number {
    return this.#native.authorizations.size;
  }

  sessionCount(): number {
    return this.#native.sessions.size;
  }

  revokeAuthorization(authorizationId: string): void {
    this.#revokeAuthorizationWith(authorizationId, clearTimeout);
  }

  #revokeAuthorizationWith(authorizationId: string, cancel: typeof clearTimeout): void {
    const authorization = this.#native.authorizations.get(authorizationId);
    if (!authorization) return;
    cancel(authorization.expiryTimer);
    authorization.decryptionKey.fill(0);
    this.#native.authorizations.delete(authorizationId);
  }

  /** Revokes a session's unlock and every reveal authorization issued from it. */
  revokeSession(sessionId: string): void {
    this.#revokeSessionWith(sessionId, this.revokeAuthorization.bind(this), clearTimeout);
  }

  #revokeSessionWith(sessionId: string, revokeAuthorization: (id: string) => void, cancel: typeof clearTimeout): void {
    const unlock = this.#native.sessions.get(sessionId);
    if (unlock) {
      cancel(unlock.expiryTimer);
      for (const entry of unlock.decryptionKeys.values()) entry.decryptionKey.fill(0);
      unlock.decryptionKeys.clear();
      this.#native.sessions.delete(sessionId);
    }
    for (const authorization of [...this.#native.authorizations.values()]) {
      if (authorization.sessionId === sessionId) revokeAuthorization(authorization.authorizationId);
    }
  }

  /** Revokes every holder of a record's key. */
  revokeKey(keyId: string): void {
    for (const authorization of [...this.#native.authorizations.values()]) {
      if (authorization.keyId === keyId) this.revokeAuthorization(authorization.authorizationId);
    }
    for (const unlock of this.#native.sessions.values()) {
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
    for (const unlock of this.#native.sessions.values()) {
      const held = unlock.decryptionKeys.get(keyId);
      if (!held) continue;
      held.decryptionKey.fill(0);
      if (keepUserId === undefined || unlock.userId === keepUserId) held.decryptionKey = Buffer.from(nextKey);
      else unlock.decryptionKeys.delete(keyId);
    }
    for (const authorization of [...this.#native.authorizations.values()]) {
      if (authorization.keyId !== keyId) continue;
      const ownerUserId = authorization.sessionId === undefined ? undefined : this.#native.sessions.get(authorization.sessionId)?.userId;
      if (keepUserId !== undefined && ownerUserId !== keepUserId) {
        this.revokeAuthorization(authorization.authorizationId);
        continue;
      }
      authorization.decryptionKey.fill(0);
      authorization.decryptionKey = Buffer.from(nextKey);
    }
  }

  revokeAll(): void {
    for (const authorizationId of [...this.#native.authorizations.keys()]) this.revokeAuthorization(authorizationId);
    for (const sessionId of [...this.#native.sessions.keys()]) this.revokeSession(sessionId);
  }
}

const nativeRevokeAuthorization = HeldKeys.prototype.revokeAuthorization;
const nativeRevokeSession = HeldKeys.prototype.revokeSession;
const nativeStartTimer = setTimeout;
const nativeCancelTimer = clearTimeout;
