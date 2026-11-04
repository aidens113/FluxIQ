/**
 * The one typed error every model call raises when the user's key is locked
 * (hosted production plan, Model Calls; H0-S5): no live unlock of the user in
 * this workspace holds the key the call needs -- after a restart, an
 * eviction, a sign-out or an administrator's session revoke. It replaces both
 * the raw "Secret key session unlock is unavailable" and the sign-out
 * sentence. A call made for a person waits for them first, so this is the rare
 * path where nothing can wake it. Category `auth_required`: never retried, ended
 * by the person unlocking, which their password does once.
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

/** The sentence a locked call raises, naming the instance's host: "Unlock your model key: open app.getfluxiq.com and enter your password once". */
export function secretsLockedMessage(instanceHost: string): string {
  return `Unlock your model key: open ${instanceHost} and enter your password once`;
}

/** True for a value carrying the `secrets.locked` code and a message. */
export function isSecretsLockedError(value: unknown): value is SecretsLockedError {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  if (record.code !== SECRETS_LOCKED_ERROR_CODE || typeof record.message !== "string") return false;
  return record.signInUrl === undefined || typeof record.signInUrl === "string";
}
