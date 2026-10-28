/**
 * A panel session's digest: the lower-case hex SHA-256 of the session id, the
 * form identity-access stores and looks sessions up under. A session id is the
 * cookie's bearer value, so it never leaves the server; a digest stands in for
 * it wherever a contract records which session did something
 * (`approvingSessionId` on a connected client, `startedFromSessionId` on a run
 * context). A digest is for audit and correlation only, never a handle that
 * releases a key or resumes a session.
 */
export const SESSION_DIGEST_PATTERN = /^[a-f0-9]{64}$/u;

/** True for a session digest. A raw session id (a UUID) is refused. */
export function isSessionDigest(value: unknown): value is string {
  return typeof value === "string" && SESSION_DIGEST_PATTERN.test(value);
}
