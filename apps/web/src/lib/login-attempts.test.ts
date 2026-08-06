import { describe, expect, it } from "vitest";
import { LoginAttemptTracker } from "./login-attempts";

describe("login attempt tracking", () => {
  it("locks a key after the configured number of failures", () => {
    let now = 1_000;
    const tracker = new LoginAttemptTracker({ windowMs: 10_000, lockoutMs: 5_000, maxAttempts: 3 }, () => now);

    expect(tracker.registerFailure("client:user").count).toBe(1);
    expect(tracker.registerFailure("client:user").count).toBe(2);
    expect(tracker.registerFailure("client:user").lockedUntilMs).toBe(6_000);
    expect(tracker.remainingLockout("client:user")).toBe(5_000);

    now = 6_001;
    expect(tracker.remainingLockout("client:user")).toBe(0);
  });

  it("resets expired windows and clears successful logins", () => {
    let now = 1_000;
    const tracker = new LoginAttemptTracker({ windowMs: 1_000, lockoutMs: 5_000, maxAttempts: 5 }, () => now);
    tracker.registerFailure("client:user");
    now = 2_001;
    expect(tracker.registerFailure("client:user").count).toBe(1);
    tracker.clear("client:user");
    expect(tracker.remainingLockout("client:user")).toBe(0);
  });
});
