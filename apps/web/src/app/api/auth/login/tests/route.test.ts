import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import type { LoginAttemptState } from "../../../../../lib/login-attempts";

const fixture = vi.hoisted(() => {
  class TotpRequiredError extends Error {}
  return {
    root: "",
    authenticate: vi.fn(),
    revokeSession: vi.fn(),
    unlockSession: vi.fn(),
    TotpRequiredError,
  };
});

vi.mock("fluxiq", () => ({ DEFAULT_SESSION_TTL_MS: 60_000, TotpRequiredError: fixture.TotpRequiredError }));
vi.mock("next/headers", () => ({ cookies: vi.fn() }));
vi.mock("../../../../../lib/fluxiq", () => ({
  getFluxIQ: () => ({
    paths: { fluxiq: fixture.root },
    programs: {
      identityAccess: { authenticate: fixture.authenticate, revokeSession: fixture.revokeSession },
      secretKeys: { unlockSession: fixture.unlockSession },
    },
  }),
}));

import { loginTotpError } from "../route";

// The route's bounds: failed logins per username, per trusted client address,
// and across the whole panel.
const USERNAME_MAX_ATTEMPTS = 5;
const ADDRESS_MAX_ATTEMPTS = 20;
const PANEL_MAX_ATTEMPTS = 100;
// The whole-panel failures a case drives through the route, after seeding the rest.
const DRIVEN_PANEL_FAILURES = 5;
const GUESSED_PASSWORD = "dummy-password-guess";

const trustProxy = process.env.FLUXIQ_TRUST_PROXY;
const roots: string[] = [];
let POST: (request: Request) => Promise<Response>;

describe("login credential validation", () => {
  it("accepts only six ASCII TOTP digits when a code is supplied", () => {
    expect(loginTotpError(undefined)).toBeNull();
    expect(loginTotpError("")).toBeNull();
    expect(loginTotpError("123456")).toBeNull();
    expect(loginTotpError("12345")).toContain("6 digits");
    expect(loginTotpError("１２３４５６")).toContain("6 digits");
    expect(loginTotpError("12345a")).toContain("6 digits");
  });
});

// Every case drives the durable attempt store: each login takes up to six
// locked read-modify-write cycles on disk. Alone a case finishes in under half a
// second, but under the parallel suite on Windows a 25-login case measured over
// 5 s (2026-10-07 sweep: about 250 ms a login), so the whole-panel cases seed
// their store rather than drive 100 logins through it.
//
// A case that times out is not stopped: vitest abandons its body, which keeps
// running. Each case therefore logs in through `caseLogin()`, bound to its own
// route module and refused once the case has ended, so an abandoned case cannot
// keep failing logins into the next case's store or calling its mocks. Before
// that, one timed-out whole-panel case made the next one lock out early.
describe("login attempt bounds", { timeout: 60_000 }, () => {
  beforeEach(async () => {
    // A fresh attempt store and route module per test, so no count carries over.
    fixture.root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-login-route-"));
    roots.push(fixture.root);
    vi.resetModules();
    ({ POST } = await import("../route"));
    delete process.env.FLUXIQ_TRUST_PROXY;
    fixture.authenticate.mockReset();
    fixture.revokeSession.mockReset();
    fixture.unlockSession.mockReset();
    fixture.unlockSession.mockResolvedValue({ sessionId: "dummy-session", expiresAtMs: Date.now() + 60_000, unlockedKeyCount: 0 });
  });

  afterEach(() => {
    if (trustProxy === undefined) delete process.env.FLUXIQ_TRUST_PROXY;
    else process.env.FLUXIQ_TRUST_PROXY = trustProxy;
  });

  afterAll(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
  });

  it.each([
    { name: "no trusted proxy, with a forwarded address it must ignore", trust: false, forwardedFor: "203.0.113.20" },
    { name: "a trusted proxy that forwards no address", trust: true, forwardedFor: undefined },
  ])("without a trusted client address ($name), failures across other usernames do not lock out a different username", async ({ trust, forwardedFor }) => {
    const login = caseLogin();
    if (trust) process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));

    const statuses: number[] = [];
    for (let attempt = 0; attempt < ADDRESS_MAX_ATTEMPTS + 5; attempt += 1) {
      statuses.push((await login(forwardedFor, `sprayed-${attempt}`)).status);
    }

    expect(statuses).toEqual(Array(ADDRESS_MAX_ATTEMPTS + 5).fill(401));
    fixture.authenticate.mockResolvedValue(successfulLogin("different-user"));
    expect((await login(forwardedFor, "different-user")).status).toBe(200);
  });

  it("with a trusted proxy, bounds failed logins from one address across usernames, without bounding another address", async () => {
    const login = caseLogin();
    process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));

    const statuses: number[] = [];
    for (let attempt = 0; attempt < ADDRESS_MAX_ATTEMPTS; attempt += 1) {
      statuses.push((await login("203.0.113.10", `sprayed-${attempt}`)).status);
    }

    expect(statuses.slice(0, -1)).toEqual(Array(ADDRESS_MAX_ATTEMPTS - 1).fill(401));
    expect(statuses.at(-1)).toBe(429);
    expect(fixture.authenticate).toHaveBeenCalledTimes(ADDRESS_MAX_ATTEMPTS);

    fixture.authenticate.mockResolvedValue(successfulLogin("never-tried"));
    const locked = await login("203.0.113.10", "never-tried");
    expect(locked.status).toBe(429);
    expect(Number(locked.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(fixture.authenticate).toHaveBeenCalledTimes(ADDRESS_MAX_ATTEMPTS);

    const otherAddress = await login("203.0.113.11", "never-tried");
    expect(otherAddress.status).toBe(200);
    expect(fixture.authenticate).toHaveBeenCalledTimes(ADDRESS_MAX_ATTEMPTS + 1);
  });

  it("keeps the lower per-username bound inside the address bound", async () => {
    const login = caseLogin();
    process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));

    const statuses: number[] = [];
    for (let attempt = 0; attempt < USERNAME_MAX_ATTEMPTS; attempt += 1) {
      statuses.push((await login("203.0.113.12", "targeted")).status);
    }

    expect(statuses).toEqual([...Array(USERNAME_MAX_ATTEMPTS - 1).fill(401), 429]);
    expect((await login("203.0.113.12", "targeted")).status).toBe(429);
    expect((await login("203.0.113.12", "another-user")).status).toBe(401);
  });

  it.each([
    { name: "a trusted proxy, each failure from its own address", trust: true },
    { name: "no trusted proxy", trust: false },
  ])("trips the whole-panel bound at 100 failures ($name)", async ({ trust }) => {
    const login = caseLogin();
    if (trust) process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));

    // The panel has already counted all but the last few failures; the rest come
    // through the route, each from its own address and username. Were the seed
    // not read, every one of them would answer 401 and the case would fail.
    seedPanelFailures(PANEL_MAX_ATTEMPTS - DRIVEN_PANEL_FAILURES);
    const statuses: number[] = [];
    for (let attempt = 0; attempt < DRIVEN_PANEL_FAILURES; attempt += 1) {
      statuses.push((await login(trust ? `198.51.100.${attempt}` : undefined, `panel-${attempt}`)).status);
    }

    expect(statuses.slice(0, -1)).toEqual(Array(DRIVEN_PANEL_FAILURES - 1).fill(401));
    expect(statuses.at(-1)).toBe(429);

    fixture.authenticate.mockResolvedValue(successfulLogin("after-panel"));
    expect((await login(trust ? "198.51.100.200" : undefined, "after-panel")).status).toBe(429);
    expect(fixture.authenticate).toHaveBeenCalledTimes(DRIVEN_PANEL_FAILURES);
  });

  it("does not count an authenticator prompt for a correct password against the address", async () => {
    const login = caseLogin();
    process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new fixture.TotpRequiredError("Authenticator code required"));

    for (let attempt = 0; attempt < ADDRESS_MAX_ATTEMPTS + 5; attempt += 1) {
      const response = await login("203.0.113.13", `two-factor-${attempt}`);
      expect(response.status).toBe(401);
      await expect(response.json()).resolves.toMatchObject({ requiresTotp: true });
    }

    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));
    const guess = await login("203.0.113.13", "guessed");
    expect(guess.status).toBe(401);
    await expect(guess.json()).resolves.toMatchObject({ attemptsRemaining: USERNAME_MAX_ATTEMPTS - 1 });
  });
});

/**
 * The login one case drives: bound to the route module its `beforeEach` loaded,
 * and refused once the case has ended, so a case vitest abandons on a timeout
 * cannot reach the next case's store or mocks.
 */
function caseLogin(): (forwardedFor: string | undefined, username: string) => Promise<Response> {
  const post = POST;
  let ended = false;
  onTestFinished(() => {
    ended = true;
  });
  return (forwardedFor, username) => {
    if (ended) return Promise.reject(new Error("This case has ended; its login no longer runs."));
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
    return post(new Request("http://127.0.0.1/api/auth/login", {
      method: "POST",
      headers,
      body: JSON.stringify({ username, password: GUESSED_PASSWORD }),
    }));
  };
}

/** Writes `count` whole-panel failures into this case's store, in the store's own file format. */
function seedPanelFailures(count: number): void {
  const nowMs = Date.now();
  const panel: LoginAttemptState = { count, windowStartedAtMs: nowMs, lockedUntilMs: 0, updatedAtMs: nowMs };
  const directory = path.join(fixture.root, "security");
  mkdirSync(directory, { recursive: true });
  writeFileSync(path.join(directory, "login-panel-attempts.json"), JSON.stringify({ schemaVersion: 1, attempts: { panel } }));
}

function successfulLogin(username: string) {
  return {
    session: { id: "dummy-session", userId: `user.${username}`, expiresAtMs: Date.now() + 60_000 },
    user: { id: `user.${username}`, username },
    role: { id: "admin", permissions: [] },
  };
}
