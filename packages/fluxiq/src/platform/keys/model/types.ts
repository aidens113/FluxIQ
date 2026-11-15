import type { IamPrincipal } from "../../iam/index.ts";

/** A key is enrolled for an existing user and workspace by a trusted, authorized caller. */
export type KeyBinding = {
  userId: string;
  workspaceId: string;
};

export type KeyEnrollment = KeyBinding & {
  /** Canonical base64url Ed25519 SPKI DER. Private key material is never accepted. */
  publicKey: string;
};

export type EnrolledKeyRecord = KeyEnrollment & {
  keyId: string;
  createdAtMs: number;
  revokedAtMs: number | null;
  lastUsedAtMs: number | null;
};

/** Only a SHA-256 digest of the bearer is persisted. */
export type KeySessionRecord = {
  tokenDigest: string;
  keyId: string;
  audience: string;
  createdAtMs: number;
  expiresAtMs: number;
  revokedAtMs: number | null;
  lastUsedAtMs: number | null;
};

export type KeySessionLookup = {
  key: EnrolledKeyRecord;
  session: KeySessionRecord;
};

export type KeySessionResponse = {
  sessionToken: string;
  expiresAt: number;
  serverTime: number;
};

/** Authentication identifies a user; resource authorization must still apply that user's IAM policies. */
export type AuthenticatedKeyPrincipal = {
  principal: IamPrincipal;
  keyId: string;
  createdAtMs: number;
  expiresAtMs: number;
};

export type KeySessionIssue = {
  keyId: string;
  nonceDigest: string;
  nonceExpiresAtMs: number;
  session: KeySessionRecord;
};

/** Nonce consumption and session insertion are one durable transaction. */
export type KeyStore = {
  /** Drains in-flight operations and refuses new ones. Every operation already closes its SQLite connection. */
  close(): Promise<void>;
  enroll(record: EnrolledKeyRecord): Promise<EnrolledKeyRecord | null>;
  getKey(keyId: string): Promise<EnrolledKeyRecord | null>;
  listKeys(binding: KeyBinding): Promise<EnrolledKeyRecord[]>;
  issue(input: KeySessionIssue): Promise<"issued" | "replayed" | "revoked">;
  findSession(tokenDigest: string, nowMs: number): Promise<KeySessionLookup | null>;
  touchSession(tokenDigest: string, nowMs: number): Promise<KeySessionLookup | null>;
  revokeKey(keyId: string, nowMs: number): Promise<boolean>;
  revokeSession(tokenDigest: string, nowMs: number): Promise<boolean>;
};

export type KeySessionService = {
  /** This port does not authorize enrollment. Its caller must already have done so. Never expose it as trust-on-first-use. */
  enrollKey(input: KeyEnrollment): Promise<EnrolledKeyRecord>;
  /** Trusted management port. The caller must authorize this user/workspace binding before listing it. */
  listKeys(binding: KeyBinding): Promise<EnrolledKeyRecord[]>;
  exchange(proof: unknown): Promise<KeySessionResponse>;
  authenticate(token: string): Promise<AuthenticatedKeyPrincipal>;
  /** Trusted administrative ports; HTTP composition must authorize their caller. */
  revokeKey(keyId: string): Promise<boolean>;
  revokeSession(token: string): Promise<boolean>;
};
