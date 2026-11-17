/**
 * The capability metadata field a client sets to `true` to say it answers
 * `server.reconcile_command`. Core asks only a session that declared it, on
 * any capability; a session that did not is never asked, and a lost reply to
 * it keeps the outcome it had (`timed_out`).
 */
export const CLIENT_GATEWAY_RECONCILE_ANSWER_METADATA_KEY = "answersReconcile";
