import type { JsonObject } from "../../core/index.ts";
import type { ScryptParameters } from "../_shared/password-kdf/index.ts";

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
  /**
   * Written ahead of an Identity Access credential change: the value re-sealed
   * under the user's next password. It replaces `sealed` at commit, or at the
   * first unlock or reveal it opens for; abort removes it.
   */
  pendingSealed?: EncryptedSecretValueRecordV2 | undefined;
};

/**
 * A version 1 seal: scrypt at Node's default cost (N=2^14), recording no
 * parameters, with the base64url salt text itself as the scrypt salt. Still
 * read; never written. It is re-sealed as version 2 at its next successful
 * unlock or reveal.
 */
export type EncryptedSecretValueRecordV1 = {
  version: 1;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

/**
 * A version 2 seal: records its scrypt parameters, which must be in the read
 * allowlist, and derives from the decoded salt bytes. `sealedByUserId` is a
 * non-secret hint naming the account whose password sealed the value, so a
 * login tries only that user's keys; tampering with it affects availability
 * only.
 */
export type EncryptedSecretValueRecordV2 = {
  version: 2;
  algorithm: "aes-256-gcm";
  kdf: "scrypt";
  kdfParams: ScryptParameters;
  sealedByUserId?: string | undefined;
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

export type EncryptedSecretValueRecord = EncryptedSecretValueRecordV1 | EncryptedSecretValueRecordV2;

export type SecretKeysSnapshot = {
  keys: SecretKeySummary[];
};
