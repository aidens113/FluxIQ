import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** Who proved the temporary credential, and until when their setup cookie can replace it. */
export type CredentialSetupGrant = { userId: string; username: string; expiresAtMs: number };

type HeldGrant = CredentialSetupGrant & { digest: Buffer };
type GrantGlobal = typeof globalThis & { __fluxiqCredentialSetupGrants?: Map<string, HeldGrant> };

/** Long enough to choose a password; after it the person proves the temporary credential again. */
const GRANT_TTL_MS = 30 * 60 * 1000;
const TOKEN_BYTES = 32;

// On globalThis, as the web runtime is: Next bundles each route on its own, so
// a module-level map would not be the one the setup route reads.
function held(): Map<string, HeldGrant> {
  const state = globalThis as GrantGlobal;
  state.__fluxiqCredentialSetupGrants ??= new Map();
  return state.__fluxiqCredentialSetupGrants;
}

function digestOf(token: string): Buffer {
  return createHash("sha256").update(token).digest();
}

/**
 * Setup grants, in this process's memory only: a restart forgets them and the
 * person signs in with the temporary credential again. One per account, so a
 * new proof replaces the last; only the token's digest is kept.
 */
export const credentialSetupGrants = {
  ttlMs: GRANT_TTL_MS,

  issue(input: { userId: string; username: string }, nowMs = Date.now()): { token: string; expiresAtMs: number } {
    const token = randomBytes(TOKEN_BYTES).toString("base64url");
    const expiresAtMs = nowMs + GRANT_TTL_MS;
    held().set(input.userId, { userId: input.userId, username: input.username, expiresAtMs, digest: digestOf(token) });
    return { token, expiresAtMs };
  },

  /** The live grant this token names, or null; expired grants are dropped as they are met. */
  find(token: string | undefined, nowMs = Date.now()): CredentialSetupGrant | null {
    if (!token) return null;
    const digest = digestOf(token);
    for (const [userId, grant] of held()) {
      if (grant.expiresAtMs <= nowMs) {
        held().delete(userId);
        continue;
      }
      if (timingSafeEqual(grant.digest, digest)) return { userId: grant.userId, username: grant.username, expiresAtMs: grant.expiresAtMs };
    }
    return null;
  },

  forget(userId: string): void {
    held().delete(userId);
  }
};
