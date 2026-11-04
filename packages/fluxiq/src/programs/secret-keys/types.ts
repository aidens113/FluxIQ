import type { JsonObject } from "../../core/index.ts";
import type { ModelKeyLockReason } from "@fluxiq/contracts/automation";
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
  /** `unlocked` is said only on a snapshot read for a caller, and only of that caller's own keys. */
  keys: Array<SecretKeySummary & { unlocked?: boolean; lockedBecause?: ModelKeyLockReason }>;
};

/**
 * Who asks for a session's unlock to be dropped (`revokeSessionUnlock`): the
 * user asking (null when nobody vouches for one), and whether they are an
 * administrator. `administrator` is true only when the caller's own permission
 * check admitted them (`identity.manage`), never because they hold a session id.
 */
export type SecretKeyUnlockRevoker = {
  userId: string | null;
  administrator: boolean;
};

/**
 * Who keeps a credential unlock: a paired client, or a signed-in panel session.
 * Non-secret: a holder id names a trusted client or a session's digest, never a
 * credential or a raw session id.
 */
export type SecretKeyCredentialHolderKind = "paired-client" | "panel-session";

/** A holder's private key, sealed under a key only its credential derives. */
export type SecretKeyCredentialUnlockWrap = {
  salt: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

/** One record's data key, sealed so that only the holder's private key opens it. */
export type SecretKeyCredentialUnlockBox = {
  ephemeralPublicKey: string;
  iv: string;
  tag: string;
  ciphertext: string;
};

/**
 * What Core stores so a holder's unlock can come back with no password: nothing
 * in it opens a key without the holder's credential, which Core keeps only as a
 * digest. `wraps` holds one wrap, or two for the moment a credential rotation is
 * written ahead of the new digest. `boxes` is by Secret Keys record id; a box
 * whose record was re-sealed no longer opens it, and is dropped when found.
 * `lockedAtMs` is set by a lock (a sign-out, a revoke): nothing but the person's
 * own explicit unlock boxes a key for this holder again.
 */
export type SecretKeyCredentialUnlockRecord = {
  recordType: "secret-key-credential-unlock";
  id: string;
  holderId: string;
  holderKind: SecretKeyCredentialHolderKind;
  userId: string;
  expiresAtMs: number;
  publicKey: string;
  wraps: SecretKeyCredentialUnlockWrap[];
  boxes: Record<string, SecretKeyCredentialUnlockBox>;
  /** The digest of the panel session that approved this holder, so that session's sign-out locks it. */
  approvingSessionDigest?: string | undefined;
  /** A person-facing name for the holder, such as a browser's; never a secret. */
  label?: string | undefined;
  lockedAtMs?: number | undefined;
  /** Why it locked, in the words a person is told (`modelKeyLockedWords`). */
  lockReason?: ModelKeyLockReason | undefined;
  updatedAtMs: number;
};

/** What is remembered of one person across restarts: nothing secret. */
export type SecretKeyUnlockPersonRecord = {
  recordType: "secret-key-unlock-person";
  id: string;
  userId: string;
  /** When they were first told why their key needs their password once, so it is said once. */
  firstUnlockToldAtMs?: number | undefined;
  /** When their password was last reset without the old one: keys sealed before it no longer open. */
  passwordResetAtMs?: number | undefined;
};

/**
 * A holder as the caller verified it. `heldAs` is the id its unlock is held
 * under in memory: a paired client's holder id, or a panel session's own id,
 * which is never stored.
 */
export type SecretKeyCredentialHolder = {
  holderKind: SecretKeyCredentialHolderKind;
  holderId: string;
  heldAs: string;
  userId: string;
  expiresAtMs: number;
  approvingSessionDigest?: string | undefined;
  label?: string | undefined;
};

/**
 * A panel session that ended, as Identity Access announced it: `digest` is the
 * session's stored digest, null when a whole person's sessions ended together
 * (`wholeUserId`). `administrator` is true for an administrator's revoke.
 */
export type SecretKeySessionEnd = {
  digest: string | null;
  wholeUserId?: string | undefined;
  revokerUserId: string | null;
  administrator: boolean;
  /** Digests of every session still live now, to tell a holder whose approving session already ended. */
  liveSessionDigests?: ReadonlySet<string> | undefined;
};
