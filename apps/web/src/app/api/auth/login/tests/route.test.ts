import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
// 5 s, and a case that times out keeps running and rewrites the shared mocks
// under the next case. The budget matches the whole-panel case below.
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
    if (trust) process.env.FLUXIQ_TRUST_PROXY = "true";
    fixture.authenticate.mockRejectedValue(new Error("Invalid username or credentials"));

    const statuses: number[] = [];
    for (let attempt = 0; attempt < PANEL_MAX_ATTEMPTS; attempt += 1) {
      statuses.push((await login(trust ? `198.51.100.${attempt}` : undefined, `panel-${attempt}`)).status);
    }

    expect(statuses.slice(0, -1)).toEqual(Array(PANEL_MAX_ATTEMPTS - 1).fill(401));
    expect(statuses.at(-1)).toBe(429);

    fixture.authenticate.mockResolvedValue(successfulLogin("after-panel"));
    expect((await login(trust ? "198.51.100.200" : undefined, "after-panel")).status).toBe(429);
    expect(fixture.authenticate).toHaveBeenCalledTimes(PANEL_MAX_ATTEMPTS);
  }, 60_000);

  it("does not count an authenticator prompt for a correct password against the address", async () => {
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

function login(forwardedFor: string | undefined, username: string): Promise<Response> {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (forwardedFor) headers["x-forwarded-for"] = forwardedFor;
  return POST(new Request("http://127.0.0.1/api/auth/login", {
    method: "POST",
    headers,
    body: JSON.stringify({ username, password: GUESSED_PASSWORD }),
  }));
}

function successfulLogin(username: string) {
  return {
    session: { id: "dummy-session", userId: `user.${username}`, expiresAtMs: Date.now() + 60_000 },
    user: { id: `user.${username}`, username },
    role: { id: "admin", permissions: [] },
  };
}
