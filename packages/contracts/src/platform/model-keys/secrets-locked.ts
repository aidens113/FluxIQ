/**
 * The one typed error every model call raises when the user's key is locked
 * (hosted production plan, Model Calls; H0-S5): no live unlock of the user in
 * this workspace holds the key the call needs -- after a restart, an
 * eviction, a sign-out or an administrator's session revoke. It replaces both
 * the raw "Secret key session unlock is unavailable" and the sign-out
 * sentence, before a build and mid-build alike. Category `auth_required`:
 * never retried, ended by the person signing in or re-unlocking.
 */
export const SECRETS_LOCKED_ERROR_CODE = "secrets.locked";

/**
 * The error as it travels (an API error body, a gateway `server.error`, a
 * chat message's failure): `message` is for the person; `signInUrl`, when set,
 * is the absolute URL that unlocks the key (the panel's sign-in or re-unlock).
 */
export type SecretsLockedError = {
  code: typeof SECRETS_LOCKED_ERROR_CODE;
  message: string;
  signInUrl?: string;
};

/** The sentence every locked path shows, naming the instance's host: "Sign in at app.getfluxiq.com to unlock your model key". */
export function secretsLockedMessage(instanceHost: string): string {
  return `Sign in at ${instanceHost} to unlock your model key`;
}

/** True for a value carrying the `secrets.locked` code and a message. */
export function isSecretsLockedError(value: unknown): value is SecretsLockedError {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.code !== SECRETS_LOCKED_ERROR_CODE || typeof record.message !== "string") return false;
  return record.signInUrl === undefined || typeof record.signInUrl === "string";
}
