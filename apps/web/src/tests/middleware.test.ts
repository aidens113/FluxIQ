import { afterEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../middleware";

const PUBLIC_ENV = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.getfluxiq.com" };

function run(url: string, init: { method?: string; headers?: Record<string, string> } = {}, env: Record<string, string> = {}) {
  vi.unstubAllEnvs();
  for (const [key, value] of Object.entries(env)) vi.stubEnv(key, value);
  return middleware(new NextRequest(url, init));
}

afterEach(() => vi.unstubAllEnvs());

describe("middleware", () => {
  it("rewrites /.well-known/fluxiq to /api/discovery", () => {
    const response = run("http://127.0.0.1:3000/.well-known/fluxiq");
    const target = new URL(response.headers.get("x-middleware-rewrite") ?? "");
    expect(target.pathname).toBe("/api/discovery");
    expect(target.port).toBe("3000");
  });
  it("refuses cross-site cookie writes on a public profile and passes same-origin", async () => {
    const cookie = "__Host-fluxiq_session=abc";
    const bad = run("https://app.getfluxiq.com/api/x", { method: "POST", headers: { cookie, origin: "https://getfluxiq.com", "sec-fetch-site": "same-site" } }, PUBLIC_ENV);
    expect(bad.status).toBe(403);
    expect(await bad.json()).toEqual({ ok: false, code: "cross_site_request" });
    const good = run("https://app.getfluxiq.com/api/x", { method: "POST", headers: { cookie, origin: "https://app.getfluxiq.com", "sec-fetch-site": "same-origin" } }, PUBLIC_ENV);
    expect(good.status).toBe(200);
    const bearer = run("https://app.getfluxiq.com/api/x", { method: "POST", headers: { cookie, authorization: "Bearer t", origin: "https://evil.example" } }, PUBLIC_ENV);
    expect(bearer.status).toBe(200);
    expect(run("https://app.getfluxiq.com/api/x", { method: "POST" }, PUBLIC_ENV).status).toBe(200);
  });
  it("keeps localhost and 127.0.0.1 working on a local install", () => {
    for (const host of ["localhost:3000", "127.0.0.1:3000"]) {
      const response = run(`http://${host}/api/x`, { method: "POST", headers: { cookie: "fluxiq_session=abc", origin: `http://${host}`, host } });
      expect(response.status).toBe(200);
    }
    const foreign = run("http://localhost:3000/api/x", { method: "POST", headers: { cookie: "fluxiq_session=abc", origin: "https://evil.example", host: "localhost:3000" } });
    expect(foreign.status).toBe(403);
  });
  it("refuses the operator-only endpoints on public profiles only", async () => {
    const path = "/api/programs/deployment-sync/sync";
    const refused = run(`https://app.getfluxiq.com${path}`, { method: "POST" }, PUBLIC_ENV);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toEqual({ ok: false, code: "operator_only" });
    expect(run(`http://127.0.0.1:3000${path}`, { method: "POST" }).status).toBe(200);
  });
  it("leaves the sign-in pages and health reachable with no session", () => {
    for (const path of ["/welcome", "/reset", "/setup", "/api/health"]) expect(run(`https://app.getfluxiq.com${path}`, {}, PUBLIC_ENV).status).toBe(200);
  });
});
