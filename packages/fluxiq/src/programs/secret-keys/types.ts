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

/**
 * Which model key is the workspace's default, and what the panel assistant uses.
 * One small record beside the keys; it holds key ids, a model id and a notice,
 * never a value. Absent until something sets it: the default is then the oldest
 * enabled model key, so a workspace made before this record needs no migration.
 */
export type ModelKeySettingsRecord = {
  recordType: "secret-keys-model-settings";
  id: string;
  /** The key chosen or promoted as default; read only while it is still an enabled model key. */
  defaultKeyId?: string | undefined;
  /**
   * Who made `defaultKeyId` the default: the person who chose it, or the creator
   * of the workspace's first model key. Absent when it was promoted on its own
   * (a lost default passing on) or chosen before this was recorded. Only a
   * default its own owner chose pays for other people's assistant messages.
   */
  defaultChosenBy?: string | undefined;
  /** Said when the default changed on its own, until the person picks a default. */
  defaultNotice?: { message: string; atMs: number } | undefined;
  /** The key the assistant uses; absent means "the default key". */
  assistantKeyId?: string | undefined;
  /** Who chose the assistant's key (or chose "the default key" for it). Cleared when that key stops being a model key. */
  assistantChosenBy?: string | undefined;
  /** The model id for that key's provider; absent means the provider's normal model. */
  assistantModel?: string | undefined;
  /** The provider `assistantModel` was chosen for, so a model is never sent to another provider. */
  assistantModelProvider?: string | undefined;
  /** What one message to the assistant may spend, in US dollars; absent means the assistant's default. */
  assistantAllowanceUsd?: number | undefined;
  updatedAtMs: number;
};

/** The model-key choices as a client shows them: no ids of values, only which key. */
export type ModelKeySettingsView = {
  defaultKeyId: string | null;
  defaultNotice?: { message: string; atMs: number } | undefined;
  assistantKeyId: string | null;
  assistantModel: string | null;
  /**
   * The provider of the key the assistant uses now (the chosen one, else the
   * default), as the key names it; null with no model key. Lets a person whose
   * own key list does not hold the workspace's key see which provider answers.
   */
  assistantProvider: string | null;
  /** The per-message spending allowance a person chose for the assistant, in US dollars; null means the assistant's default. */
  assistantAllowanceUsd: number | null;
};

/**
 * What the panel assistant should call, or a plain reason there is none. Never
 * carries a secret value. `ownerId` is the key's creator (absent for a legacy
 * key nobody is stamped on); `sharedByOwner` says its owner chose it as the
 * workspace's key (`ModelKeySettings.resolveAssistant`), which is the only way
 * it may pay for another person's message.
 */
export type AssistantModelChoice =
  | { ok: true; keyId: string; keyName: string; provider?: string | undefined; model?: string | undefined; ownerId?: string | undefined; sharedByOwner: boolean }
  | { ok: false; reason: string };

export type SecretKeysSnapshot = {
  /** `unlocked` is said only on a snapshot read for a caller, and only of that caller's own keys. */
  keys: Array<SecretKeySummary & { unlocked?: boolean; lockedBecause?: ModelKeyLockReason }>;
  /** Which key is the default, and the assistant's choice. */
  modelSettings?: ModelKeySettingsView;
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

/** One key pair of a holder: the private half under its credential, and what is boxed to the public half, by Secret Keys record id. */
export type SecretKeyCredentialUnlockGeneration = {
  publicKey: string;
  wrap: SecretKeyCredentialUnlockWrap;
  boxes: Record<string, SecretKeyCredentialUnlockBox>;
};

/**
 * What Core stores so a holder's unlock can come back with no password: nothing
 * in it opens a key without the holder's credential, which Core keeps only as a
 * digest. `pending` is a whole new key pair for the credential a rotation just sent,
 * until it is confirmed in use. A box whose record was re-sealed no longer opens it,
 * and is dropped when found. `lockedAtMs` is set when a holder is new (a paired client
 * starts locked) and by a lock (a sign-out, a revoke): nothing but the person's own
 * unlock naming this holder boxes a key for it again.
 */
export type SecretKeyCredentialUnlockRecord = SecretKeyCredentialUnlockGeneration & {
  recordType: "secret-key-credential-unlock";
  id: string;
  holderId: string;
  holderKind: SecretKeyCredentialHolderKind;
  userId: string;
  expiresAtMs: number;
  pairedAtMs?: number;
  pending?: SecretKeyCredentialUnlockGeneration & { credentialDigest: string } | undefined;
  /** The digest of the panel session that approved this holder, so that session's sign-out locks it. */
  approvingSessionDigest?: string | undefined;
  /** A person-facing name for the holder, such as a browser's; never a secret. */
  label?: string | undefined;
  /** When it last spoke, for the person choosing which browser to unlock. Not secret; at most a day out while it stays connected. */
  lastUsedAtMs?: number | undefined;
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

/** A locked paired client as its person chooses among them. */
export type SecretKeyLockedClient = {
  holderId: string;
  label: string;
  pairedAtMs?: number;
  lastUsedAtMs?: number;
  /** No proof has ever reached this browser: its unlock starts from the browser itself, never from a list. */
  neverUnlocked?: boolean;
};

/**
 * A holder as the caller verified it. `heldAs` is a panel session's own id, which is
 * never stored; a paired client's unlock is held under a random handle instead.
 */
export type SecretKeyCredentialHolder = {
  holderKind: SecretKeyCredentialHolderKind;
  holderId: string;
  heldAs?: string | undefined;
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
