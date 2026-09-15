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
 */
export class HeldKeys {
  private readonly authorizations = new Map<string, HeldRevealAuthorization>();
  private readonly sessions = new Map<string, HeldSessionUnlock>();

  authorization(authorizationId: string): HeldRevealAuthorization | undefined {
    return this.authorizations.get(authorizationId);
  }

  session(sessionId: string): HeldSessionUnlock | undefined {
    return this.sessions.get(sessionId);
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
