import type { PanelEmailTemplate, PlatformProvisioningInput, PlatformProvisioningOperationName, PlatformProvisioningResponse, PlatformProvisioningResult } from "@fluxiq/contracts/platform";

// The provisioning service's ports and surface (hosted production plan,
// Account Provisioning API; lane B1). Stable seam for lane B1's workers
// (t789): change it only with the B1 supervisor. The listener, the command
// line and the welcome and reset pages build against `PlatformProvisioning`
// and `PlatformAccountLinks`; the service builds against the ports. Nothing
// here imports `programs/`: the ports are structural, so the identity-access
// service is assignable to `PlatformIdentityPort` as it is.

/**
 * Who calls an operation. Each call is authorised and audited as exactly one
 * IAM decision:
 *
 * - `service-identity`: a platform-level IAM service identity (the website
 *   backend over the private listener), decided by the IAM authorizer against
 *   its attached policies (`FluxIQProvisioner`);
 * - `platform-admin`: the operator's command line; allowed, and recorded with
 *   `matched: { policy: "platform-admin", sid: null }`;
 * - `in-process`: a caller inside the server that already authorised its
 *   person (the owner claim, the admin "add user" form, a plugin), recorded
 *   with `matched: { policy: "in-process", sid: null }` and the acting user,
 *   when there is one, as the principal.
 *
 * `transport` decides the HTTP-only rules: over `http` a password is refused,
 * `setPassword` is unavailable, an existing email is `{status: "exists"}`
 * (never `email_taken`) and `userId` is returned only for `created`.
 */
export type PlatformProvisioningCaller =
  | { kind: "service-identity"; name: string; transport: "http" | "in-process"; sourceIp?: string }
  | { kind: "platform-admin"; transport: "in-process" }
  | { kind: "in-process"; actorUserId: string | null; transport: "in-process" };

/** One operation's answer: the contract's `{ok: true, result} | {ok: false, error}`. */
export type PlatformProvisioningAnswer<TName extends PlatformProvisioningOperationName> = PlatformProvisioningResponse<PlatformProvisioningResult<TName>>;

/**
 * `platform.provisioning`: the operations of the frozen contract
 * (`PLATFORM_PROVISIONING_OPERATIONS`). `run` parses `input` with the
 * transport's schema (`httpInput` over HTTP, `input` in-process) and never
 * throws for a refusal: every failure is a typed error. Passwords never reach
 * a log, the audit, an error or the idempotency record.
 */
export type PlatformProvisioning = {
  run<TName extends PlatformProvisioningOperationName>(operation: TName, input: unknown, caller: PlatformProvisioningCaller): Promise<PlatformProvisioningAnswer<TName>>;
};

/** A parsed operation input, for callers that build one in code. */
export type PlatformProvisioningRequest<TName extends PlatformProvisioningOperationName> = PlatformProvisioningInput<TName>;

/**
 * The identity-access operations provisioning needs. Structurally a subset of
 * `IdentityAccessService`, so the service itself is passed. `username` is the
 * account's email. `revokeUserSessions` also drops each session's key unlock
 * (through the service's session-revocation subscribers). `updateUser` and
 * `deleteUser` refuse to disable, delete or demote the last enabled
 * administrator by throwing an error whose `code` is
 * `"identity.last_administrator"`, which `run` answers as `last_administrator`.
 * `resetPassword` is every password provisioning sets (a welcome or reset
 * link, and the `setPassword` operation): the checked link or the authorised
 * operation is the authority, so it never asks for the old credential and
 * works on a credential sealed before a restart (replacing it with its PIN
 * cleared, as an administrator's reset does). It refuses an account with
 * two-factor sign-in whose credential is sealed by throwing an error whose
 * `code` is `"identity.two_factor_reset_refused"`, answered as `two_factor`.
 */
export type PlatformIdentityPort = {
  upsertUser(params: { id: string; username: string; displayName: string; roleId: string; enabled?: boolean; password?: string }): Promise<{ id: string }>;
  updateUser(params: { id: string; displayName?: string; roleId?: string; enabled?: boolean }): Promise<{ id: string }>;
  resetPassword(userId: string, password: string): Promise<unknown>;
  createSession(userId: string, ttlMs?: number): Promise<{ id: string; userId: string; expiresAtMs: number }>;
  revokeUserSessions(userId: string): Promise<number>;
  deleteUser(userId: string): Promise<boolean>;
};

/**
 * One email to send. `variables` fill the template's `{{name}}` placeholders;
 * a link variable is the only place a token appears, and a sender must never
 * log `variables`. Welcome: `displayName`, `welcomeUrl`, `expiresInHours`;
 * account-exists: `signInUrl`, `resetUrl`; password-reset: `displayName`,
 * `resetUrl`, `expiresInMinutes`.
 */
export type PlatformEmailMessage = {
  template: PanelEmailTemplate;
  to: string;
  variables: Readonly<Record<string, string>>;
};

/** The `EmailSender` port (`none`, `file`, and a memory double for tests; `smtp` later). A send that fails throws; the caller decides whether that fails the operation. */
export type EmailSender = {
  readonly kind: string;
  send(message: PlatformEmailMessage): Promise<void>;
};

/** What redeeming a link proved: the account it belongs to and the honoured `continueUrl`, or null. */
export type PlatformLinkRedemption = {
  userId: string;
  email: string;
  continueUrl: string | null;
};

/**
 * Why a redemption was refused. One message for unknown, used and expired, so
 * a probe learns nothing. `two_factor`: the account has two-factor sign-in and
 * its credential is sealed, so a link cannot reset it (an administrator can);
 * the link stays unused.
 */
export type PlatformLinkRefusal = { ok: false; code: "invalid_link" | "weak_password" | "disabled" | "two_factor" };

/**
 * The welcome and reset links, for Core's own pages. A token is 32 random
 * bytes, base64url, single use, stored as its SHA-256 digest; welcome links
 * live 24 hours, reset links 1 hour. `redeemWelcome` verifies the email, sets
 * the password, and returns the account; the page then signs the person in.
 * `requestReset` answers the same whether or not the email has an account.
 */
export type PlatformAccountLinks = {
  redeemWelcome(input: { token: string; password: string }): Promise<{ ok: true; redemption: PlatformLinkRedemption } | PlatformLinkRefusal>;
  requestReset(input: { email: string }): Promise<{ ok: true }>;
  redeemReset(input: { token: string; password: string }): Promise<{ ok: true; redemption: PlatformLinkRedemption } | PlatformLinkRefusal>;
};
