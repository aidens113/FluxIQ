import { createHash, randomBytes } from "node:crypto";
import { KeySessionError, checkSessionProofTime, decodeKeyValue, readEnrolledPublicKey, readSessionProof, verifySessionProof, type KeySessionService } from "../model/index.ts";
import { keySessionConfiguration } from "./configuration.ts";
import { keyBindingPrincipal } from "./key-binding-principal.ts";
import type { KeySessionServiceOptions } from "./options.ts";

const NONCE_RETENTION_MS = 600_000;

function digest(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function tokenDigest(token: string): string {
  if (typeof token !== "string" || !token.startsWith("fxs1.")) throw new KeySessionError("key.unauthorized");
  try {
    decodeKeyValue(token.slice(5), 32);
  } catch {
    throw new KeySessionError("key.unauthorized");
  }
  return digest(token);
}

/** Registered-key proof exchange and bearer authentication. This service does not grant resource permissions. */
export function createKeySessionService(options: KeySessionServiceOptions): KeySessionService {
  const config = keySessionConfiguration(options);
  return {
    async enrollKey(input) {
      if (typeof input !== "object" || input === null || Object.keys(input).some((field) => !["userId", "workspaceId", "publicKey"].includes(field))) {
        throw new KeySessionError("key.bad_enrollment");
      }
      keyBindingPrincipal(input);
      let parsed: ReturnType<typeof readEnrolledPublicKey>;
      try {
        parsed = readEnrolledPublicKey(input.publicKey);
      } catch {
        throw new KeySessionError("key.bad_enrollment");
      }
      await config.requireEligible(input);
      const record = await options.store.enroll({
        keyId: parsed.keyId,
        publicKey: parsed.publicKey,
        userId: input.userId,
        workspaceId: input.workspaceId,
        createdAtMs: config.time(),
        revokedAtMs: null,
        lastUsedAtMs: null
      });
      if (!record) throw new KeySessionError("key.bad_enrollment");
      return record;
    },
    async listKeys(binding) {
      keyBindingPrincipal(binding);
      await config.requireEligible(binding);
      return options.store.listKeys(binding);
    },
    async exchange(input) {
      const proof = readSessionProof(input);
      if (proof.aud !== config.audience) throw new KeySessionError("key.bad_audience");
      checkSessionProofTime(proof.time, config.time());
      const key = await options.store.getKey(proof.keyId);
      if (!key || key.revokedAtMs !== null) throw new KeySessionError("key.unknown");
      verifySessionProof(proof, key);
      await config.requireEligible(key);
      const nowMs = config.time();
      checkSessionProofTime(proof.time, nowMs);
      const sessionToken = `fxs1.${randomBytes(32).toString("base64url")}`;
      const expiresAt = nowMs + config.lifetimeMs;
      const result = await options.store.issue({
        keyId: key.keyId,
        nonceDigest: digest(proof.nonce),
        nonceExpiresAtMs: nowMs + NONCE_RETENTION_MS,
        session: {
          tokenDigest: digest(sessionToken),
          keyId: key.keyId,
          audience: config.audience,
          createdAtMs: nowMs,
          expiresAtMs: expiresAt,
          revokedAtMs: null,
          lastUsedAtMs: null
        }
      });
      if (result === "replayed") throw new KeySessionError("key.replayed");
      if (result !== "issued") throw new KeySessionError("key.unknown");
      return { sessionToken, expiresAt, serverTime: nowMs };
    },
    async authenticate(token) {
      const hashed = tokenDigest(token);
      const candidate = await options.store.findSession(hashed, config.time());
      if (!candidate || candidate.session.audience !== config.audience) throw new KeySessionError("key.unauthorized");
      await config.requireEligible(candidate.key);
      // Read again after the external eligibility check: revocation/expiry may have happened while it awaited IO.
      const live = await options.store.touchSession(hashed, config.time());
      if (!live || live.session.audience !== config.audience || live.key.userId !== candidate.key.userId || live.key.workspaceId !== candidate.key.workspaceId) throw new KeySessionError("key.unauthorized");
      return {
        principal: keyBindingPrincipal(live.key),
        keyId: live.key.keyId,
        createdAtMs: live.session.createdAtMs,
        expiresAtMs: live.session.expiresAtMs
      };
    },
    revokeKey: (keyId) => options.store.revokeKey(keyId, config.time()),
    revokeSession: (token) => options.store.revokeSession(tokenDigest(token), config.time())
  };
}
