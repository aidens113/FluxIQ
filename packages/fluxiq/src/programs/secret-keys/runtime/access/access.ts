import { randomUUID } from "node:crypto";
import { PAIRED_CLIENT_UNLOCK_PREFIX, type ModelKeyAvailability } from "@fluxiq/contracts/platform";
import type { SecretKeyRecord, SecretKeySummary } from "../../types.ts";
import type { HeldKeys, HeldRevealAuthorization, SecretRevealAuthorizationMetadata } from "../held-keys.ts";
import type { SecretKeyStore } from "../key-store.ts";
import { SecretKeyDataKeys } from "./data-keys.ts";
import type { SecretKeyUseAuthority, SecretKeyUseAuthorization, SecretKeyUsePrincipal } from "./types.ts";
import { SecretKeyAccessUnavailableError } from "./unavailable-error.ts";
import { consumeSecretKeyManagementProof, type SecretKeyManagementProof } from "./management-proof.ts";
import { sameSecretKeyVersion } from "./version.ts";

/** Authenticated per-call use, independent of a panel session's decryption cache. */
export class SecretKeyAccess {
  constructor(private readonly ports: { store: SecretKeyStore; heldKeys: HeldKeys; dataKeys: SecretKeyDataKeys; authority?: SecretKeyUseAuthority | undefined; now(): number; summary(record: SecretKeyRecord): SecretKeySummary }) {}

  async createUseAuthorization(input: SecretKeyUseAuthorization): Promise<SecretRevealAuthorizationMetadata> {
    validatePrincipal(input.principal);
    await this.ports.store.load();
    const record = this.ports.store.require(input.id);
    const ownerUserId = record.createdBy ?? input.principal.userId;
    const decision = await this.authorize(input.principal, record, ownerUserId);
    const ttl = input.ttlMs ?? 10_000;
    if (!Number.isInteger(ttl) || ttl < 1000 || ttl > 300_000) throw new Error("Secret use authorization TTL is invalid.");
    const expiresAtMs = Math.min(this.ports.now() + ttl, decision.expiresAtMs);
    const key = this.exactHeld(record, input.principal) ?? await this.ports.dataKeys.open(record, ownerUserId);
    try {
      const baseline = this.ports.store.get(record.id);
      if (!baseline || !sameSecretKeyVersion(baseline, record)) throw new Error("Secret key changed during authorization.");
      const protectedRecord = await this.ports.dataKeys.protect(baseline, key, ownerUserId);
      if (protectedRecord !== baseline && !await this.ports.store.commit(protectedRecord, baseline)) throw new Error("Secret key changed during authorization.");
      const current = this.ports.store.require(record.id);
      if (!sameSecretKeyVersion(current, protectedRecord)) throw new Error("Secret key changed during authorization.");
      await this.authorize(input.principal, current, ownerUserId);
      if (expiresAtMs <= this.ports.now()) throw new Error("Secret use authority expired.");
      const authorizationId = `secret-reveal:${randomUUID()}`;
      const authorization: HeldRevealAuthorization = {
        authorizationId, keyId: current.id, keyUpdatedAtMs: current.updatedAtMs,
        expiresAtMs, remainingUses: 1, decryptionKey: Buffer.from(key),
        usePrincipal: { ...input.principal }, useOwnerUserId: ownerUserId,
        useKeyVersion: structuredClone(current),
        state: "available", expiryTimer: this.ports.heldKeys.authorizationExpiryTimer(authorizationId, expiresAtMs - this.ports.now())
      };
      this.ports.heldKeys.holdAuthorization(authorization);
      return { authorizationId, keyId: current.id, keyUpdatedAtMs: current.updatedAtMs, expiresAtMs, remainingUses: 1 };
    } finally {
      key.fill(0);
    }
  }

  /** Used by the shared reveal consumer before and after any asynchronous work. */
  async assertAuthorization(authorization: HeldRevealAuthorization, record: SecretKeyRecord): Promise<void> {
    if (!authorization.usePrincipal) return;
    if (!authorization.useKeyVersion || !sameSecretKeyVersion(record, authorization.useKeyVersion)) throw new Error("Secret reveal authorization is no longer valid.");
    await this.authorize(authorization.usePrincipal, record, authorization.useOwnerUserId!);
  }

  /** Stronger management authority never comes from a model-use authorization. */
  async openForManagement(record: SecretKeyRecord, proof: SecretKeyManagementProof): Promise<{ key?: Buffer; recheck(): Promise<void> }> {
    const authorization = await consumeSecretKeyManagementProof(proof, record.id, this.ports.now);
    if (record.createdBy !== undefined && record.createdBy !== authorization.userId) throw new Error("Secret key management proof does not own this key.");
    const key = record.hostProtection && record.createdBy ? await this.ports.dataKeys.open(record, authorization.userId) : undefined;
    return { ...(key ? { key } : {}), recheck: async () => {
      if (authorization.expiresAtMs <= this.ports.now() || !await authorization.validate()) throw new Error("Secret key management proof is unavailable.");
    } };
  }

  async availability(record: SecretKeyRecord, caller?: { userId: string; sessionId: string | null }): Promise<ModelKeyAvailability> {
    if (!record.createdBy) return { state: "unavailable", code: "legacy_recovery_required" };
    if (caller?.sessionId) {
      const held = this.exactHeld(record, { kind: "session", userId: caller.userId, sessionId: caller.sessionId });
      if (held) {
        held.fill(0);
        return { state: "available" };
      }
    }
    try {
      if (!record.createdBy) throw new SecretKeyAccessUnavailableError("legacy_recovery_required");
      const key = await this.ports.dataKeys.open(record, record.createdBy);
      key.fill(0);
      return { state: "available" };
    } catch (error) {
      return { state: "unavailable", code: error instanceof SecretKeyAccessUnavailableError ? error.code : "ciphertext_invalid" };
    }
  }

  /** Migrates only material the exact authenticated caller already holds. */
  async migrateHeldSession(input: { userId: string; sessionId: string }): Promise<void> {
    await this.ports.store.load();
    const held = this.ports.heldKeys.session(input.sessionId);
    if (held?.userId !== input.userId || held.expiresAtMs <= this.ports.now()) return;
    for (const [id, material] of held.decryptionKeys) {
      const record = this.ports.store.get(id);
      if (!record || record.createdBy !== input.userId || material.keyUpdatedAtMs !== record.updatedAtMs) continue;
      const next = await this.ports.dataKeys.protect(record, material.decryptionKey, input.userId);
      if (next !== record) await this.ports.store.commit(next, record);
    }
  }

  private exactHeld(record: SecretKeyRecord, principal: SecretKeyUsePrincipal): Buffer | undefined {
    if (principal.kind === "standing") return undefined;
    const sessionId = principal.kind === "session" ? principal.sessionId : this.ports.heldKeys.pairedHandle(`${PAIRED_CLIENT_UNLOCK_PREFIX}${principal.trustedClientId}`);
    const held = this.ports.heldKeys.session(sessionId);
    const key = held?.decryptionKeys.get(record.id);
    return held?.userId === principal.userId && held.expiresAtMs > this.ports.now() && key?.keyUpdatedAtMs === record.updatedAtMs ? Buffer.from(key.decryptionKey) : undefined;
  }

  private async authorize(principal: SecretKeyUsePrincipal, record: SecretKeyRecord, ownerUserId: string): Promise<{ ownerUserId: string; expiresAtMs: number }> {
    const decision = await this.ports.authority?.({ principal, key: this.ports.summary(record) });
    if (!record.enabled || !decision || decision.ownerUserId !== ownerUserId || (record.createdBy !== undefined && record.createdBy !== ownerUserId) || !Number.isFinite(decision.expiresAtMs) || decision.expiresAtMs <= this.ports.now()) throw new Error("Secret key use is not authorized.");
    return decision;
  }
}

function validatePrincipal(principal: SecretKeyUsePrincipal): void {
  if (!principal || typeof principal.userId !== "string" || !principal.userId) throw new TypeError("An authenticated secret-use principal is required.");
  if ((principal.kind === "session" || principal.kind === "client") && principal.purpose !== undefined && principal.purpose !== "workspace-assistant") throw new TypeError("Invalid secret-use purpose.");
  const fields = principal.kind === "session" ? [principal.sessionId] : principal.kind === "client" ? [principal.trustedClientId] : principal.kind === "standing" ? [principal.authorizationId, principal.projectId, principal.flowId, principal.purpose === "loop_verification" || principal.purpose === "repair" ? principal.purpose : ""] : [];
  if (!fields.length || fields.some((value) => typeof value !== "string" || !value)) throw new TypeError("Invalid secret-use principal.");
}
