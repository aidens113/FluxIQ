import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { LocalSetupCodeCheck } from "./types";

type HeldCode = { digest: Buffer; expiresAtMs: number };
type CodeGlobal = typeof globalThis & { __fluxiqLocalSetupCode?: HeldCode | null };

/** 20 random bytes, 160 bits, as 40 hex characters, as the public profiles' code is. */
const CODE_BYTES = 20;
/** As long as a panel session: a link printed at start still works that day; after it, a restart prints a new one. */
const CODE_TTL_MS = 12 * 60 * 60 * 1000;

function digestOf(code: string): Buffer {
  return createHash("sha256").update(code.trim(), "utf8").digest();
}

// On globalThis: Next loads the start-up code and the setup route as separate bundles in one process.
function store(): CodeGlobal {
  return globalThis as CodeGlobal;
}

/**
 * The local profile's one-time setup code, in this process's memory only (its
 * digest, never the code): each start issues a new one, a successful claim
 * spends it, and it expires after 12 hours.
 */
export const localSetupCode = {
  ttlMs: CODE_TTL_MS,

  issue(nowMs = Date.now()): { code: string; expiresAtMs: number } {
    const code = randomBytes(CODE_BYTES).toString("hex");
    const expiresAtMs = nowMs + CODE_TTL_MS;
    store().__fluxiqLocalSetupCode = { digest: digestOf(code), expiresAtMs };
    return { code, expiresAtMs };
  },

  check(given: string, nowMs = Date.now()): LocalSetupCodeCheck {
    const held = store().__fluxiqLocalSetupCode;
    if (!held) return "none";
    if (!timingSafeEqual(digestOf(given), held.digest)) return "wrong";
    return held.expiresAtMs <= nowMs ? "expired" : "valid";
  },

  spend(): void {
    store().__fluxiqLocalSetupCode = null;
  }
};
