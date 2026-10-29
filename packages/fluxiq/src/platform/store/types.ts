import type { PlatformAccountStatus } from "@fluxiq/contracts/platform";

// The platform store's records and port (hosted production plan, Tenancy And
// Data, "Layout v3"; lane B1). Stable seam for lane B1's workers (t789):
// change it only with the B1 supervisor. Under `single` the store lives in
// today's `.fluxiq` databases beside every other program's; under `multi`
// lane C moves it to `<dataRoot>/platform/`. Timestamps are epoch
// milliseconds. No record ever holds a password, a hash of one, a key, a
// session id or a raw link token.

/** How an account came to exist: the private listener, an in-process caller (owner claim, "add user", a plugin), or the operator's command line. */
export type PlatformAccountOrigin = "provisioning-listener" | "in-process" | "command-line";

/** A sign-in identity of an account. `password` is the only provider at launch; its subject is the account's email. */
export type PlatformAccountIdentity = {
  provider: "password";
  subject: string;
};

/**
 * A scheduled deletion: the account is disabled at once and deleted at
 * `scheduledForMs`. `receiptId` is the receipt the operation returned.
 */
export type PlatformAccountDeletion = {
  receiptId: string;
  requestedAtMs: number;
  scheduledForMs: number;
};

/**
 * One account (hosted production plan, Identity And Sessions, "Account
 * record"). `userId` is the identity-access user id, the same id in both
 * stores. `email` is trimmed and lower-cased and unique across the store.
 * `emailVerifiedAtMs` is set when the welcome link is redeemed.
 */
export type PlatformAccountRecord = {
  userId: string;
  email: string;
  emailVerifiedAtMs: number | null;
  displayName: string;
  externalId: string | null;
  identities: PlatformAccountIdentity[];
  status: PlatformAccountStatus;
  disabledReason: string | null;
  createdVia: PlatformAccountOrigin;
  termsVersion: string | null;
  createdAtMs: number;
  updatedAtMs: number;
  lastSignInAtMs: number | null;
  deletion: PlatformAccountDeletion | null;
};

/** `personal`: one sign-up's own workspace; `organisation`: an enterprise workspace of several members; `single`: the one workspace of a single-tenancy root. */
export type PlatformWorkspaceKind = "personal" | "organisation" | "single";

export type PlatformWorkspaceRecord = {
  workspaceId: string;
  kind: PlatformWorkspaceKind;
  /** The account a personal workspace belongs to; null for the others. */
  ownerUserId: string | null;
  createdAtMs: number;
};

/** A workspace membership (`workspace.members`): the policies are predefined policy names, attached to the member's IAM user principal in that workspace. */
export type PlatformMembershipRecord = {
  workspaceId: string;
  userId: string;
  policies: string[];
  groups: string[];
  status: "active" | "removed";
  createdAtMs: number;
  updatedAtMs: number;
};

/** What a one-time link does when redeemed: `welcome` verifies the email and sets the first password; `reset` sets a new password. */
export type PlatformLinkPurpose = "welcome" | "reset";

/**
 * A one-time link token. Only the SHA-256 hex digest of the 32-byte token is
 * stored; the token itself travels once, in the emailed link's fragment.
 * `continueUrl` is a same-origin `/connect/authorize` path or null.
 */
export type PlatformLinkTokenRecord = {
  tokenDigest: string;
  purpose: PlatformLinkPurpose;
  userId: string;
  continueUrl: string | null;
  createdAtMs: number;
  expiresAtMs: number;
  usedAtMs: number | null;
};

/**
 * The first answer to one `requestId` of one operation, replayed for the same
 * input. `inputDigest` is a SHA-256 hex digest of the canonical input with any
 * password removed; `response` is the `PlatformProvisioningResponse` returned.
 */
export type PlatformIdempotencyRecord = {
  operation: string;
  requestId: string;
  inputDigest: string;
  response: unknown;
  createdAtMs: number;
};

/**
 * The platform store. Every method reads or writes durable state; none
 * caches across calls, so a second process over the same repository sees a
 * write on its next read. Writes are last-writer-wins per record; callers
 * that need read-modify-write atomicity serialize themselves (the
 * provisioning service does, per process).
 *
 * - `putAccount` also maintains the email and externalId indexes, and throws
 *   `PlatformStoreConflictError` when the email (or externalId) already names
 *   another account;
 * - `consumeLinkToken` marks a live, unused, unexpired token used and returns
 *   it, or returns null; a token is never returned twice while it stays used;
 * - `releaseLinkToken` puts back, unused, a token consumed at `usedAtMs`, for
 *   a redemption that failed after consuming it, so the link works again
 *   until it expires; false (and nothing changes) when the token is gone or
 *   was used at another time;
 * - `deleteAccount` removes the account row and its indexes, its memberships,
 *   and its link tokens; workspaces are deleted separately.
 */
export type PlatformStore = {
  getAccount(userId: string): Promise<PlatformAccountRecord | null>;
  findAccountByEmail(email: string): Promise<PlatformAccountRecord | null>;
  findAccountByExternalId(externalId: string): Promise<PlatformAccountRecord | null>;
  listAccounts(): Promise<PlatformAccountRecord[]>;
  putAccount(record: PlatformAccountRecord): Promise<void>;
  deleteAccount(userId: string): Promise<boolean>;

  getWorkspace(workspaceId: string): Promise<PlatformWorkspaceRecord | null>;
  listWorkspaces(): Promise<PlatformWorkspaceRecord[]>;
  putWorkspace(record: PlatformWorkspaceRecord): Promise<void>;
  deleteWorkspace(workspaceId: string): Promise<boolean>;

  getMembership(workspaceId: string, userId: string): Promise<PlatformMembershipRecord | null>;
  listMembershipsOfUser(userId: string): Promise<PlatformMembershipRecord[]>;
  listMembershipsOfWorkspace(workspaceId: string): Promise<PlatformMembershipRecord[]>;
  putMembership(record: PlatformMembershipRecord): Promise<void>;
  deleteMembership(workspaceId: string, userId: string): Promise<boolean>;

  putLinkToken(record: PlatformLinkTokenRecord): Promise<void>;
  getLinkToken(tokenDigest: string): Promise<PlatformLinkTokenRecord | null>;
  consumeLinkToken(tokenDigest: string, purpose: PlatformLinkPurpose, nowMs: number): Promise<PlatformLinkTokenRecord | null>;
  releaseLinkToken(tokenDigest: string, usedAtMs: number): Promise<boolean>;
  /** Removes every token of the account for that purpose (a re-sent welcome or reset supersedes the earlier link); returns how many. */
  deleteLinkTokensOf(userId: string, purpose: PlatformLinkPurpose): Promise<number>;

  getIdempotency(operation: string, requestId: string): Promise<PlatformIdempotencyRecord | null>;
  putIdempotency(record: PlatformIdempotencyRecord): Promise<void>;
};
