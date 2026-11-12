/** The `code` the identity port's refusal carries (`IdentityUsernameTakenError` in identity access). */
const USERNAME_TAKEN_CODE = "identity.username_taken";

/**
 * Whether an error the identity port threw is its refusal of a sign-in name
 * another person already holds in any case. A provisioned account's sign-in
 * name is its email, so this is an email already in use by a person without
 * an account. Matched by the error's `code`, as `PlatformIdentityPort`
 * documents it, never by its message. The port refuses before it writes.
 */
export function isUsernameTaken(error: unknown): boolean {
  return typeof error === "object" && error !== null && (error as { code?: unknown }).code === USERNAME_TAKEN_CODE;
}
