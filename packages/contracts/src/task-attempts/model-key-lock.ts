/**
 * Why a person's model key is locked where they are, and the one thing to do about
 * it. Every sentence a person reads about a locked key comes from here: the empty
 * chat's setup step, the reply to a task that did not start, the line a waiting
 * task writes, so they cannot drift apart.
 *
 * - `first_unlock`: nothing has been stored for this person yet, as on the first
 *   start after unlocks began to last. Told once (`Unlock` then ends it for good).
 * - `signed_out`: they signed out, and this browser went with it.
 * - `administrator`: an administrator ended their session.
 * - `sessions_ended`: all their sessions ended together, such as a disabled account
 *   brought back.
 * - `password_reset`: their password was reset without the old one, so nothing they
 *   can type opens the key: they add it again.
 * - `unknown`: locked, with nothing more to say.
 */
export const MODEL_KEY_LOCK_REASONS = Object.freeze(["first_unlock", "signed_out", "administrator", "sessions_ended", "password_reset", "unknown"] as const);

export type ModelKeyLockReason = (typeof MODEL_KEY_LOCK_REASONS)[number];

const UNLOCK = "Open FluxIQ and enter your password once to unlock it.";

const WORDS: Readonly<Record<ModelKeyLockReason, string>> = Object.freeze({
  first_unlock: "FluxIQ now keeps your model key unlocked on this browser, and needs your password once to set that up. Open FluxIQ and enter it there.",
  signed_out: `Your model key locked on this browser because you signed out of FluxIQ. ${UNLOCK}`,
  administrator: `Your model key locked on this browser because an administrator ended your session. ${UNLOCK}`,
  sessions_ended: `Your model key locked on this browser because all your FluxIQ sessions were ended. ${UNLOCK}`,
  password_reset: "Your password was reset, so FluxIQ can no longer open your model key. Open FluxIQ and add it again.",
  unknown: `Your model key is locked on this browser. ${UNLOCK}`
});

/** What a person reads about a locked key: why, in plain words, and the one action. */
export function modelKeyLockedWords(reason: ModelKeyLockReason): string {
  return WORDS[reason];
}

/** `reason` when it is one the contract knows, otherwise `unknown`. */
export function readModelKeyLockReason(value: unknown): ModelKeyLockReason {
  return (MODEL_KEY_LOCK_REASONS as readonly unknown[]).includes(value) ? value as ModelKeyLockReason : "unknown";
}
