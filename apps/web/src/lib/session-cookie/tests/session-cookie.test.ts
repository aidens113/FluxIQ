import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const ENV_KEYS = ["FLUXIQ_PROFILE", "FLUXIQ_PUBLIC_ORIGIN"] as const;

async function load(env: Partial<Record<(typeof ENV_KEYS)[number], string>>) {
  for (const key of ENV_KEYS) delete process.env[key];
  Object.assign(process.env, env);
  vi.resetModules();
  return import("../index");
}

beforeEach(() => vi.resetModules());
afterEach(() => {
  for (const key of ENV_KEYS) delete process.env[key];
});

describe("session cookie", () => {
  it("is plain and not Secure on the local profile", async () => {
    const { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } = await load({});
    expect(FLUXIQ_SESSION_COOKIE).toBe("fluxiq_session");
    expect(sessionCookieOptions(60)).toEqual({ httpOnly: true, sameSite: "lax", secure: false, path: "/", maxAge: 60 });
  });

  it("is a Secure __Host- cookie on an https public origin", async () => {
    const { FLUXIQ_SESSION_COOKIE, sessionCookieOptions } = await load({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "https://panel.example.test" });
    expect(FLUXIQ_SESSION_COOKIE).toBe("__Host-fluxiq_session");
    expect(sessionCookieOptions(60)).toEqual({ httpOnly: true, sameSite: "lax", secure: true, path: "/", maxAge: 60 });
  });

  it("keeps the plain name on an http public origin", async () => {
    const { FLUXIQ_SESSION_COOKIE } = await load({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "http://panel.example.test" });
    expect(FLUXIQ_SESSION_COOKIE).toBe("fluxiq_session");
  });

  it("is re-exported by lib/auth under the same name", async () => {
    vi.doMock("next/headers", () => ({ cookies: vi.fn() }));
    vi.doMock("../../fluxiq", () => ({ getFluxIQ: vi.fn() }));
    const session = await load({ FLUXIQ_PROFILE: "self-hosted", FLUXIQ_PUBLIC_ORIGIN: "https://panel.example.test" });
    const auth = await import("../../auth");
    expect(auth.FLUXIQ_SESSION_COOKIE).toBe(session.FLUXIQ_SESSION_COOKIE);
  });
});
