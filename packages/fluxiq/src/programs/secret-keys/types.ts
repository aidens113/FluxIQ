import type { JsonObject } from "../../core/index.ts";

export type SecretKeyKind = "llm" | "custom";

export type SecretKeyScope = "global" | "domain" | "flow" | "custom";

export type SecretKeySummary = {
  id: string;
  name: string;
  kind: SecretKeyKind;
  provider?: string | undefined;
  scope: SecretKeyScope;
  scopeRef?: string | undefined;
  description?: string | undefined;
  enabled: boolean;
  createdBy?: string | undefined;
  createdAtMs: number;
  updatedAtMs: number;
  lastRotatedAtMs: number;
  lastRevealedAtMs?: number | undefined;
  metadata?: JsonObject | undefined;
};

export type SecretKeyRecord = SecretKeySummary & {
  recordType: "secret-key";
  encrypted: true;
  sealed: EncryptedSecretValueRecord;
};

export type EncryptedSecretValueRecord = {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type SecretKeysSnapshot = {
  keys: SecretKeySummary[];
};