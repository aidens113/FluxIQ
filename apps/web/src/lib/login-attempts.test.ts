import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DurableLoginAttemptTracker, LoginAttemptTracker, loginClientAddress } from "./login-attempts";

const tempRoots: string[] = [];
afterEach(() => {
  for (const root of tempRoots.splice(0)) rmSync(root, { recursive: true, force: true });
});

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

  it("shares durable failures across instances and survives reconstruction", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-login-attempts-"));
    tempRoots.push(root);
    const filePath = path.join(root, "attempts.json");
    let now = 1_000;
    const options = { windowMs: 10_000, lockoutMs: 5_000, maxAttempts: 3, maxEntries: 10 };
    const first = new DurableLoginAttemptTracker(filePath, options, () => now);
    const second = new DurableLoginAttemptTracker(filePath, options, () => now);
    await first.registerFailure("client:user");
    await second.registerFailure("client:user");
    const locked = await new DurableLoginAttemptTracker(filePath, options, () => now).registerFailure("client:user");
    expect(locked.lockedUntilMs).toBe(6_000);
    expect(await first.remainingLockout("client:user")).toBe(5_000);
    now = 6_001;
    expect(await second.remainingLockout("client:user")).toBe(0);
  });

  it.each([
    ["an empty file", ""],
    ["malformed JSON", "{\schemaVersion\:1,\attempts\:"],
    ["an invalid state shape", "{\schemaVersion\:1,\attempts\:{\client:user\:{\count\:\many\}}}"]
  ])("repairs %s instead of breaking all logins", async (_label, contents) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-login-attempts-"));
    tempRoots.push(root);
    const filePath = path.join(root, "attempts.json");
    writeFileSync(filePath, contents, "utf8");
    const tracker = new DurableLoginAttemptTracker(
      filePath,
      { windowMs: 10_000, lockoutMs: 5_000, maxAttempts: 3 },
      () => 1_000
    );

    await expect(tracker.remainingLockout("client:user")).resolves.toBe(0);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({ schemaVersion: 1, attempts: {} });
  });

  it("ignores spoofable forwarding headers unless proxy trust is explicit", () => {
    const request = new Request("http://local/login", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2", "x-real-ip": "198.51.100.4" } });
    expect(loginClientAddress(request, false)).toBe("direct");
    expect(loginClientAddress(request, true)).toBe("203.0.113.10");
  });
});
