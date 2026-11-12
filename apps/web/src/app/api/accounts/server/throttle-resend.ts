import { throttleForm, type FormLimit } from "../../../../lib/form-throttle";
import type { AccountsResponse } from "./accounts-response";

/** One administrator resending to one person: three links per quarter hour. */
const PER_ADMINISTRATOR_AND_PERSON: FormLimit = { max: 3, windowMs: 15 * 60_000 };

/** One person's inbox, whoever resends: six links an hour, so several administrators cannot flood it either. */
const PER_PERSON: FormLimit = { max: 6, windowMs: 60 * 60_000 };

/**
 * Counts one resend of `userId`'s invite by `actorUserId` and answers 429,
 * with `retry-after`, once either is over its limit; null otherwise. Run it
 * only for a resend that IAM allowed and that is still an invite, so a
 * refused call never spends the allowance. Counts live in memory per process,
 * as every form limit does; the keys are user ids, never an email.
 */
export function throttleResend(actorUserId: string, userId: string): AccountsResponse | null {
  const throttled = throttleForm("accounts-resend-invite", [
    { name: "administrator-person", key: `${actorUserId}\u001f${userId}`, limit: PER_ADMINISTRATOR_AND_PERSON },
    { name: "person", key: userId, limit: PER_PERSON }
  ]);
  if (throttled === null) return null;
  const retryAfter = throttled.headers.get("retry-after");
  return {
    status: 429,
    body: { ok: false, code: "rate_limited", error: "This invite was sent several times just now. Wait a while before sending it again." },
    ...(retryAfter === null ? {} : { headers: { "retry-after": retryAfter } })
  };
}
