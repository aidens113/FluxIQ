import { NextResponse } from "next/server";
import { LoginAttemptTracker } from "../login-attempts";
import type { FormLimit } from "./FormLimit";

const trackers = new Map<string, LoginAttemptTracker>();

/**
 * Counts one request against each check and answers 429 with `retry-after`
 * when any key is over its limit, else null. A null key (no trusted address,
 * no email) is skipped. Counts live in memory per process; there is never a
 * global bucket, so no one client can lock out the rest.
 */
export function throttleForm(scope: string, checks: Array<{ name: string; key: string | null; limit: FormLimit }>): NextResponse | null {
  const active = checks.filter((check): check is { name: string; key: string; limit: FormLimit } => check.key !== null);
  const trackerOf = (name: string, limit: FormLimit) => {
    const id = `${scope}:${name}`;
    let tracker = trackers.get(id);
    if (!tracker) {
      tracker = new LoginAttemptTracker({ windowMs: limit.windowMs, lockoutMs: limit.windowMs, maxAttempts: limit.max, maxEntries: 10_000 });
      trackers.set(id, tracker);
    }
    return tracker;
  };
  const waitMs = Math.max(0, ...active.map((check) => trackerOf(check.name, check.limit).remainingLockout(check.key)));
  if (waitMs > 0) {
    return NextResponse.json(
      { ok: false, code: "rate_limited" },
      { status: 429, headers: { "retry-after": String(Math.ceil(waitMs / 1000)), "cache-control": "no-store" } },
    );
  }
  for (const check of active) trackerOf(check.name, check.limit).registerFailure(check.key);
  return null;
}
