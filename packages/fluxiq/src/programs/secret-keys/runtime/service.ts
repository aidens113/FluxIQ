import { createCipheriv, createDecipheriv, randomBytes, randomUUID, scryptSync } from "node:crypto";
import type { JsonObject } from "../../../core/index.ts";
import { createRecord, type RecordEnvelope, type Repository } from "../../database-manager/index.ts";
import type {
  EncryptedSecretValueRecord,
  SecretKeyKind,
  SecretKeyRecord,
  SecretKeyScope,
  SecretKeySummary,
  SecretKeysSnapshot
} from "../types.ts";

type SecretKeyValue = {
  id: string;
  value: string;
  updatedAtMs: number;
};

type SecretKeyCryptoKey = {
  salt: string;
  key: Buffer;
};

type CreateSecretKeyInput = {
  name: string;
  value: string;
  authorizationPassword?: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  createdBy?: string;
  nowMs?: number;
};

type UpdateSecretKeyInput = {
  id: string;
  name?: string;
  kind?: SecretKeyKind;
  provider?: string;
  scope?: SecretKeyScope;
  scopeRef?: string;
  description?: string;
  enabled?: boolean;
  metadata?: JsonObject;
  nowMs?: number;
};

type RotateSecretKeyInput = {
  id: string;
  value: string;
  authorizationPassword?: string;
  nowMs?: number;
};

type RevealSecretKeyInput = {
  id: string;
  authorizationPassword?: string;
  nowMs?: number;
};

export type SecretRevealAuthorizationMetadata = {
  authorizationId: string;
  keyId: string;
  keyUpdatedAtMs: number;
  expiresAtMs: number;
  remainingUses: 1;
};

type StoredSecretRevealAuthorization = SecretRevealAuthorizationMetadata & {
  decryptionKey: Buffer;
  state: "available" | "claimed";
  expiryTimer: ReturnType<typeof setTimeout>;
};

const MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS = 300_000;

export class SecretKeysService {
  static readonly storeKind = "secret.keys";

  private readonly records = new Map<string, SecretKeyRecord>();
  private readonly repository: Repository | undefined;
  private readonly revealAuthorizations = new Map<string, StoredSecretRevealAuthorization>();
  private readonly now: () => number;
  private loaded = false;

  constructor(options: { repository?: Repository; now?: () => number } = {}) {
    this.repository = options.repository;
    this.now = options.now ?? Date.now;
  }

  async snapshot(): Promise<SecretKeysSnapshot> {
    await this.load();
    return {
      keys: [...this.records.values()]
        .map(toSummary)
        .sort((left, right) => right.updatedAtMs - left.updatedAtMs || left.name.localeCompare(right.name))
    };
  }

  async getKeySummary(id: string): Promise<SecretKeySummary | null> {
    await this.load();
    const record = this.records.get(id);
    return record ? toSummary(record) : null;
  }

  async createKey(input: CreateSecretKeyInput): Promise<SecretKeySummary> {
    await this.load();
    const now = input.nowMs ?? Date.now();
    const id = `secret:${randomUUID()}`;
    const record: SecretKeyRecord = {
      id,
      name: cleanRequired(input.name, "name"),
      kind: normalizeKind(input.kind),
      ...(cleanOptional(input.provider) ? { provider: cleanOptional(input.provider) } : {}),
      scope: normalizeScope(input.scope),
      ...(cleanOptional(input.scopeRef) ? { scopeRef: cleanOptional(input.scopeRef) } : {}),
      ...(cleanOptional(input.description) ? { description: cleanOptional(input.description) } : {}),
      enabled: input.enabled ?? true,
      ...(cleanOptional(input.createdBy) ? { createdBy: cleanOptional(input.createdBy) } : {}),
      createdAtMs: now,
      updatedAtMs: now,
      lastRotatedAtMs: now,
      ...(input.metadata ? { metadata: input.metadata } : {}),
      recordType: "secret-key",
      encrypted: true,
      sealed: encryptSecretValue({ id, value: input.value, updatedAtMs: now }, requirePassword(input.authorizationPassword))
    };
    this.records.set(id, record);
    await this.persistRecord(record);
    return toSummary(record);
  }

  async updateKey(input: UpdateSecretKeyInput): Promise<SecretKeySummary> {
    await this.load();
    const existing = this.requireRecord(input.id);
    const updatedAtMs = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
    const next: SecretKeyRecord = {
      ...existing,
      ...(input.name !== undefined ? { name: cleanRequired(input.name, "name") } : {}),
      ...(input.kind !== undefined ? { kind: normalizeKind(input.kind) } : {}),
      ...(input.provider !== undefined ? optionalField("provider", input.provider) : {}),
      ...(input.scope !== undefined ? { scope: normalizeScope(input.scope) } : {}),
      ...(input.scopeRef !== undefined ? optionalField("scopeRef", input.scopeRef) : {}),
      ...(input.description !== undefined ? optionalField("description", input.description) : {}),
      ...(input.enabled !== undefined ? { enabled: input.enabled } : {}),
      ...(input.metadata !== undefined ? { metadata: input.metadata } : {}),
      updatedAtMs
    };
    this.records.set(existing.id, next);
    this.revokeRevealAuthorizationsForKey(existing.id);
    await this.persistRecord(next);
    return toSummary(next);
  }

  async rotateKey(input: RotateSecretKeyInput): Promise<SecretKeySummary> {
    await this.load();
    const existing = this.requireRecord(input.id);
    const now = Math.max(input.nowMs ?? Date.now(), existing.updatedAtMs + 1);
    const next: SecretKeyRecord = {
      ...existing,
      updatedAtMs: now,
      lastRotatedAtMs: now,
      sealed: encryptSecretValue({ id: existing.id, value: input.value, updatedAtMs: now }, requirePassword(input.authorizationPassword))
    };
    this.records.set(existing.id, next);
    this.revokeRevealAuthorizationsForKey(existing.id);
    await this.persistRecord(next);
    return toSummary(next);
  }

  async revealKey(input: RevealSecretKeyInput): Promise<{ key: SecretKeySummary; value: string }> {
    await this.load();
    const existing = this.requireRecord(input.id);
    const secret = decryptSecretValue(existing.sealed, requirePassword(input.authorizationPassword));
    if (secret.id !== existing.id) throw new Error("Invalid secret key payload");
    const next: SecretKeyRecord = {
      ...existing,
      lastRevealedAtMs: input.nowMs ?? Date.now()
    };
    this.records.set(existing.id, next);
    await this.persistRecord(next);
    return { key: toSummary(next), value: secret.value };
  }

  async deleteKey(id: string): Promise<boolean> {
    await this.load();
    this.revokeRevealAuthorizationsForKey(id);
    const deleted = this.records.delete(id);
    if (this.repository) return this.repository.delete(id, {});
    return deleted;
  }

  async resolveSecretValue(input: RevealSecretKeyInput): Promise<string> {
    return (await this.revealKey(input)).value;
  }

  async createRevealAuthorization(input: { id: string; authorizationPassword?: string; ttlMs?: number; nowMs?: number }): Promise<SecretRevealAuthorizationMetadata> {
    await this.load();
    const existing = this.requireRecord(input.id);
    const ttlMs = input.ttlMs ?? 60_000;
    if (!Number.isInteger(ttlMs) || ttlMs < 1000 || ttlMs > MAX_SECRET_REVEAL_AUTHORIZATION_TTL_MS) throw new Error("Secret reveal authorization TTL is invalid");
    const authorizationId = `secret-reveal:${randomUUID()}`;
    const decryptionKey = deriveSecretKey(requirePassword(input.authorizationPassword), existing.sealed.salt).key;
    const expiryTimer = setTimeout(() => this.revokeRevealAuthorization(authorizationId), ttlMs);
    expiryTimer.unref?.();
    const authorization: StoredSecretRevealAuthorization = {
      authorizationId,
      keyId: existing.id,
      keyUpdatedAtMs: existing.updatedAtMs,
      expiresAtMs: (input.nowMs ?? this.now()) + ttlMs,
      remainingUses: 1,
      decryptionKey,
      state: "available",
      expiryTimer
    };
    this.revealAuthorizations.set(authorizationId, authorization);
    return publicRevealAuthorization(authorization);
  }

  async revealKeyWithAuthorization(input: { authorizationId: string; id: string; nowMs?: number }): Promise<{ key: SecretKeySummary; value: string }> {
    const authorization = this.revealAuthorizations.get(input.authorizationId);
    const nowMs = input.nowMs ?? this.now();
    if (!authorization || authorization.state !== "available" || authorization.keyId !== input.id) throw new Error("Secret reveal authorization is unavailable");
    if (authorization.expiresAtMs <= nowMs) {
      this.revokeRevealAuthorization(input.authorizationId);
      throw new Error("Secret reveal authorization is unavailable");
    }
    authorization.state = "claimed";
    try {
      await this.load();
      const existing = this.requireRecord(input.id);
      if (existing.updatedAtMs !== authorization.keyUpdatedAtMs) throw new Error("Secret reveal authorization is no longer valid");
      const secret = decryptSecretValueWithKey(existing.sealed, authorization.decryptionKey);
      if (secret.id !== existing.id || secret.updatedAtMs !== existing.updatedAtMs) throw new Error("Invalid secret key payload");
      const next: SecretKeyRecord = { ...existing, lastRevealedAtMs: nowMs };
      this.records.set(existing.id, next);
      await this.persistRecord(next);
      const active = this.revealAuthorizations.get(input.authorizationId);
      if (active !== authorization || authorization.state !== "claimed" || authorization.expiresAtMs <= this.now()) {
        secret.value = "";
        throw new Error("Secret reveal authorization is unavailable");
      }
      const value = secret.value;
      this.revokeRevealAuthorization(input.authorizationId);
      return { key: toSummary(next), value };
    } catch (error) {
      this.revokeRevealAuthorization(input.authorizationId);
      throw error;
    }
  }

  revokeRevealAuthorization(authorizationId: string): void {
    const authorization = this.revealAuthorizations.get(authorizationId);
    if (!authorization) return;
    clearTimeout(authorization.expiryTimer);
    authorization.decryptionKey.fill(0);
    this.revealAuthorizations.delete(authorizationId);
  }

  activeRevealAuthorizationCount(): number {
    return this.revealAuthorizations.size;
  }

  close(): void {
    for (const authorizationId of [...this.revealAuthorizations.keys()]) this.revokeRevealAuthorization(authorizationId);
  }

  private revokeRevealAuthorizationsForKey(keyId: string): void {
    for (const authorization of [...this.revealAuthorizations.values()]) {
      if (authorization.keyId === keyId) this.revokeRevealAuthorization(authorization.authorizationId);
    }
  }
  private requireRecord(id: string): SecretKeyRecord {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown secret key: ${id}`);
    return record;
  }

  private async load(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    if (!this.repository) return;
    const records = await this.repository.list({});
    this.records.clear();
    for (const item of records) {
      if (isSecretKeyRecord(item.data)) this.records.set(item.id, item.data);
    }
  }

  private async persistRecord(record: SecretKeyRecord): Promise<void> {
    if (!this.repository) return;
    await this.repository.put(secretRecord(record));
  }
}

function secretRecord(record: SecretKeyRecord): RecordEnvelope {
  return createRecord({
    id: record.id,
    kind: SecretKeysService.storeKind,
    data: record as unknown as JsonObject
  });
}

function toSummary(record: SecretKeyRecord): SecretKeySummary {
  return {
    id: record.id,
    name: record.name,
    kind: record.kind,
    ...(record.provider ? { provider: record.provider } : {}),
    scope: record.scope,
    ...(record.scopeRef ? { scopeRef: record.scopeRef } : {}),
    ...(record.description ? { description: record.description } : {}),
    enabled: record.enabled,
    ...(record.createdBy ? { createdBy: record.createdBy } : {}),
    createdAtMs: record.createdAtMs,
    updatedAtMs: record.updatedAtMs,
    lastRotatedAtMs: record.lastRotatedAtMs,
    ...(record.lastRevealedAtMs ? { lastRevealedAtMs: record.lastRevealedAtMs } : {}),
    ...(record.metadata ? { metadata: record.metadata } : {})
  };
}

function requirePassword(value: string | undefined): string {
  if (!value) throw new Error("authorizationPassword is required");
  return value;
}

function cleanRequired(value: string, label: string): string {
  const clean = value.trim();
  if (!clean) throw new Error(`${label} is required`);
  return clean;
}

function cleanOptional(value: string | undefined): string | undefined {
  const clean = value?.trim();
  return clean || undefined;
}

function optionalField(key: "provider" | "scopeRef" | "description", value: string | undefined): Partial<SecretKeyRecord> {
  const clean = cleanOptional(value);
  return clean ? { [key]: clean } : { [key]: undefined };
}

function normalizeKind(value: SecretKeyKind | undefined): SecretKeyKind {
  return value === "custom" ? "custom" : "llm";
}

function normalizeScope(value: SecretKeyScope | undefined): SecretKeyScope {
  return value === "domain" || value === "flow" || value === "custom" ? value : "global";
}

function deriveSecretKey(password: string, salt = randomBytes(16).toString("base64url")): SecretKeyCryptoKey {
  return {
    salt,
    key: scryptSync(password, salt, 32)
  };
}

function encryptSecretValue(secret: SecretKeyValue, password: string): EncryptedSecretValueRecord {
  const secretKey = deriveSecretKey(password);
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", secretKey.key, iv);
  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(secret), "utf8"),
    cipher.final()
  ]);
  return {
    version: 1,
    algorithm: "aes-256-gcm",
    kdf: "scrypt",
    salt: secretKey.salt,
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url")
  };
}

function decryptSecretValue(sealed: EncryptedSecretValueRecord, password: string): SecretKeyValue {
  const secretKey = deriveSecretKey(password, sealed.salt);
  try {
    return decryptSecretValueWithKey(sealed, secretKey.key);
  } finally {
    secretKey.key.fill(0);
  }
}

function decryptSecretValueWithKey(sealed: EncryptedSecretValueRecord, key: Buffer): SecretKeyValue {
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(sealed.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(sealed.tag, "base64url"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(sealed.ciphertext, "base64url")),
    decipher.final()
  ]).toString("utf8");
  const parsed = JSON.parse(plaintext) as unknown;
  if (!isObject(parsed) || typeof parsed.id !== "string" || typeof parsed.value !== "string" || typeof parsed.updatedAtMs !== "number") {
    throw new Error("Invalid encrypted secret key payload");
  }
  return parsed as SecretKeyValue;
}

function publicRevealAuthorization(authorization: StoredSecretRevealAuthorization): SecretRevealAuthorizationMetadata {
  return {
    authorizationId: authorization.authorizationId,
    keyId: authorization.keyId,
    keyUpdatedAtMs: authorization.keyUpdatedAtMs,
    expiresAtMs: authorization.expiresAtMs,
    remainingUses: 1
  };
}

function isSecretKeyRecord(value: unknown): value is SecretKeyRecord {
  if (!isObject(value)) return false;
  return value.recordType === "secret-key"
    && value.encrypted === true
    && typeof value.id === "string"
    && typeof value.name === "string"
    && (value.kind === "llm" || value.kind === "custom")
    && (value.scope === "global" || value.scope === "domain" || value.scope === "flow" || value.scope === "custom")
    && typeof value.enabled === "boolean"
    && typeof value.createdAtMs === "number"
    && typeof value.updatedAtMs === "number"
    && typeof value.lastRotatedAtMs === "number"
    && isEncryptedSecretValueRecord(value.sealed);
}

function isEncryptedSecretValueRecord(value: unknown): value is EncryptedSecretValueRecord {
  if (!isObject(value)) return false;
  return value.version === 1
    && value.algorithm === "aes-256-gcm"
    && value.kdf === "scrypt"
    && typeof value.salt === "string"
    && typeof value.iv === "string"
    && typeof value.tag === "string"
    && typeof value.ciphertext === "string";
}

function isObject(value: unknown): value is JsonObject {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
