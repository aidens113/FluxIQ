import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { DurableLoginAttemptTracker, type LoginAttemptState, LoginAttemptTracker, loginClientAddress } from "../login-attempts";

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
    ["malformed JSON", '{"schemaVersion":1,"attempts":'],
    ["an invalid state shape", '{"schemaVersion":1,"attempts":{"client:user":{"count":"many"}}}'],
  ])("repairs %s instead of breaking all logins", async (_label, contents) => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-login-attempts-"));
    tempRoots.push(root);
    const filePath = path.join(root, "attempts.json");
    writeFileSync(filePath, contents, "utf8");
    const tracker = new DurableLoginAttemptTracker(filePath, { windowMs: 10_000, lockoutMs: 5_000, maxAttempts: 3 }, () => 1_000);

    await expect(tracker.remainingLockout("client:user")).resolves.toBe(0);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({ schemaVersion: 1, attempts: {} });
  });

  it("ignores spoofable forwarding headers unless proxy trust is explicit", () => {
    const request = new Request("http://local/login", { headers: { "x-forwarded-for": "203.0.113.10, 10.0.0.2", "x-real-ip": "198.51.100.4" } });
    expect(loginClientAddress(request, false)).toBe("direct");
    expect(loginClientAddress(request, true)).toBe("203.0.113.10");
  });
});

const durableOptions = { windowMs: 10_000, lockoutMs: 5_000, maxAttempts: 3 };

function storePath(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-login-attempts-"));
  tempRoots.push(root);
  return path.join(root, "attempts.json");
}

function storedAttempts(filePath: string): Record<string, LoginAttemptState> {
  return (JSON.parse(readFileSync(filePath, "utf8")) as { attempts: Record<string, LoginAttemptState> }).attempts;
}

describe("in-memory login attempt limits", () => {
  it("forgets an unlocked key only once its window has passed", () => {
    let now = 1_000;
    const tracker = new LoginAttemptTracker({ windowMs: 1_000, lockoutMs: 5_000, maxAttempts: 3 }, () => now);
    expect(tracker.registerFailure("client:user").count).toBe(1);

    now = 1_500;
    expect(tracker.remainingLockout("client:user")).toBe(0);
    expect(tracker.registerFailure("client:user").count).toBe(2);

    now = 3_000;
    expect(tracker.remainingLockout("client:user")).toBe(0);
    expect(tracker.registerFailure("client:user").count).toBe(1);
  });

  it("evicts the stalest key when the entry cap is reached, not the key under attack", () => {
    let now = 1_000;
    const tracker = new LoginAttemptTracker({ windowMs: 1_000_000, lockoutMs: 5_000, maxAttempts: 5, maxEntries: 2 }, () => now);
    tracker.registerFailure("client:first");
    now = 2_000;
    tracker.registerFailure("client:second");
    now = 3_000;
    tracker.registerFailure("client:third");

    now = 4_000;
    expect(tracker.registerFailure("client:third").count).toBe(2);
    now = 5_000;
    expect(tracker.registerFailure("client:first").count).toBe(1);
  });
});

describe("durable login attempt storage", () => {
  it("keeps an open failure window alive when the lockout is checked", async () => {
    const filePath = storePath();
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);
    await tracker.registerFailure("client:user");
    await tracker.registerFailure("client:user");

    expect(await tracker.remainingLockout("client:user")).toBe(0);
    expect(storedAttempts(filePath)["client:user"]?.count).toBe(2);
    expect((await tracker.registerFailure("client:user")).lockedUntilMs).toBe(6_000);
  });

  it("forgets only the key that succeeded", async () => {
    const filePath = storePath();
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);
    await tracker.registerFailure("client:user");
    await tracker.registerFailure("client:user");
    await tracker.registerFailure("client:other");

    await tracker.clear("client:user");

    expect(Object.keys(storedAttempts(filePath))).toEqual(["client:other"]);
    expect((await tracker.registerFailure("client:user")).count).toBe(1);
    expect((await tracker.registerFailure("client:other")).count).toBe(2);
  });

  it("evicts the least recently updated key when the durable store is full", async () => {
    const filePath = storePath();
    let now = 1_000;
    const tracker = new DurableLoginAttemptTracker(filePath, { ...durableOptions, windowMs: 1_000_000, maxEntries: 2 }, () => now);
    await tracker.registerFailure("client:first");
    now = 2_000;
    await tracker.registerFailure("client:second");
    now = 3_000;
    await tracker.registerFailure("client:second");
    now = 4_000;
    await tracker.registerFailure("client:third");

    expect(Object.keys(storedAttempts(filePath)).sort()).toEqual(["client:second", "client:third"]);
    expect(storedAttempts(filePath)["client:second"]?.count).toBe(2);
  });

  it("serialises concurrent failures for one key instead of losing an update", async () => {
    const filePath = storePath();
    const options = { ...durableOptions, maxAttempts: 10 };
    const first = new DurableLoginAttemptTracker(filePath, options, () => 1_000);
    const second = new DurableLoginAttemptTracker(filePath, options, () => 1_000);

    const settled = await Promise.all([first.registerFailure("client:user"), second.registerFailure("client:user")]);

    expect(settled.map((state) => state.count).sort()).toEqual([1, 2]);
    expect(storedAttempts(filePath)["client:user"]?.count).toBe(2);
  });

  it("reclaims a lock left behind by a process that died", async () => {
    const filePath = storePath();
    const lockPath = `${filePath}.lock`;
    writeFileSync(lockPath, "99999", "utf8");
    const abandonedAt = new Date(Date.now() - 60_000);
    utimesSync(lockPath, abandonedAt, abandonedAt);

    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);

    expect((await tracker.registerFailure("client:user")).count).toBe(1);
    expect(existsSync(lockPath)).toBe(false);
  });

  it("waits for a live lock rather than writing through it", async () => {
    const filePath = storePath();
    const lockPath = `${filePath}.lock`;
    writeFileSync(lockPath, "99999", "utf8");
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);

    let done = false;
    const pending = tracker.registerFailure("client:user").then((state) => {
      done = true;
      return state;
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    expect(done).toBe(false);

    rmSync(lockPath, { force: true });
    expect((await pending).count).toBe(1);
  });

  it("reports an unreadable store instead of silently clearing every lockout", async () => {
    const filePath = storePath();
    mkdirSync(filePath);
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);

    const failure = await tracker.registerFailure("client:user").catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(Error);
    expect((failure as { code?: string }).code).toBe("EISDIR");
    expect(existsSync(`${filePath}.lock`)).toBe(false);
  });
});

describe("poisoned login attempt stores", () => {
  const lockingEntry = { count: 9, windowStartedAtMs: 1_000, lockedUntilMs: 9_000_000, updatedAtMs: 1_000 };
  const poisoned = (entry: unknown) => JSON.stringify({ schemaVersion: 1, attempts: { "client:user": entry } });

  it("honours a well formed stored lockout, so the rejections below are not vacuous", async () => {
    const filePath = storePath();
    writeFileSync(filePath, poisoned(lockingEntry), "utf8");
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);

    expect(await tracker.remainingLockout("client:user")).toBe(8_999_000);
  });

  it.each([
    ["a JSON array at the root", JSON.stringify([lockingEntry])],
    ["a JSON string at the root", JSON.stringify("locked")],
    ["a null document", "null"],
    ["attempts held in an array", JSON.stringify({ schemaVersion: 1, attempts: [lockingEntry] })],
    ["an entry that is an array", poisoned([9])],
    ["an entry that is null", poisoned(null)],
    ["a fractional count", poisoned({ ...lockingEntry, count: 1.5 })],
    ["a negative count", poisoned({ ...lockingEntry, count: -1 })],
    ["a negative timestamp", poisoned({ ...lockingEntry, windowStartedAtMs: -1 })],
    ["a timestamp carried as a string", poisoned({ ...lockingEntry, updatedAtMs: "1000" })],
    [
      "a lockout that overflows to infinity",
      '{"schemaVersion":1,"attempts":{"client:user":{"count":9,"windowStartedAtMs":1000,"lockedUntilMs":1e999,"updatedAtMs":1000}}}',
    ],
  ])("refuses to lock anyone out from %s", async (_label, contents) => {
    const filePath = storePath();
    writeFileSync(filePath, contents, "utf8");
    const tracker = new DurableLoginAttemptTracker(filePath, durableOptions, () => 1_000);

    await expect(tracker.remainingLockout("client:user")).resolves.toBe(0);
    expect(JSON.parse(readFileSync(filePath, "utf8"))).toEqual({ schemaVersion: 1, attempts: {} });
  });
});

describe("login client address", () => {
  const address = (headers: Record<string, string>) => loginClientAddress(new Request("http://local/login", { headers }), true);

  it("falls back to the real-ip header when no forwarded list is present", () => {
    expect(address({ "x-real-ip": "198.51.100.4" })).toBe("198.51.100.4");
  });

  it("does not let a blank forwarded list win over the real-ip header", () => {
    expect(address({ "x-forwarded-for": "   ", "x-real-ip": "198.51.100.4" })).toBe("198.51.100.4");
  });

  it("trims the client entry out of a forwarded chain", () => {
    expect(address({ "x-forwarded-for": "203.0.113.10 , 10.0.0.2" })).toBe("203.0.113.10");
  });

  it.each([
    ["no forwarding headers at all", {}],
    ["a blank forwarded list and no real-ip", { "x-forwarded-for": "  ,  " }],
    ["a blank real-ip", { "x-real-ip": "   " }],
  ])("buckets %s under one unknown proxy client", (_label, headers) => {
    expect(address(headers)).toBe("proxy-unknown");
  });
});
