import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitted = vi.hoisted(() => vi.fn(async () => ({ status: 200, body: { ok: true } })));
vi.mock("../../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ provisioning: {} }) }));
vi.mock("../../../welcome/server", () => ({ toAccountLinkHttp: (answer: { status: number }) => new Response("{}", { status: answer.status }) }));
vi.mock("../../server/submitSignup", () => ({ submitSignup: submitted }));

const OPEN = { FLUXIQ_PROFILE: "service", FLUXIQ_PUBLIC_ORIGIN: "https://app.example.test", FLUXIQ_SIGNUP: "open", FLUXIQ_TRUST_PROXY: "true" };

function stubEnv(env: Record<string, string>) {
  for (const [name, value] of Object.entries(env)) vi.stubEnv(name, value);
}

beforeEach(() => {
  vi.resetModules();
  submitted.mockClear();
});
afterEach(() => vi.unstubAllEnvs());

const post = (address: string, email: string) =>
  new Request("https://app.example.test/signup/submit", { method: "POST", headers: { "x-forwarded-for": address }, body: JSON.stringify({ email, displayName: "A Person" }) });

describe("POST /signup/submit", () => {
  it("answers 404 and runs nothing while sign-up is off: unset, off, or open off the service profile", async () => {
    for (const env of [{ ...OPEN, FLUXIQ_SIGNUP: "" }, { ...OPEN, FLUXIQ_SIGNUP: "off" }, { ...OPEN, FLUXIQ_PROFILE: "self-hosted" }]) {
      vi.unstubAllEnvs();
      stubEnv(env);
      const { POST } = await import("../route");
      const answer = await POST(post("203.0.113.1", "person@example.test"));
      expect(answer.status).toBe(404);
      expect(await answer.json()).toEqual({ ok: false, code: "not_found" });
    }
    expect(submitted).not.toHaveBeenCalled();
  });

  it("answers 429 past 3 sign-ups for one normalised email, whatever the address", async () => {
    stubEnv(OPEN);
    const { POST } = await import("../route");
    expect((await POST(post("203.0.113.1", "Person@Example.test"))).status).toBe(200);
    expect((await POST(post("203.0.113.2", " person@example.test "))).status).toBe(200);
    expect((await POST(post("203.0.113.3", "PERSON@example.test"))).status).toBe(200);
    const refused = await POST(post("203.0.113.4", "person@example.test"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
    expect(submitted).toHaveBeenCalledTimes(3);
    expect((await POST(post("203.0.113.4", "other@example.test"))).status).toBe(200);
  });

  it("answers 429 past 10 sign-ups from one client address across emails", async () => {
    stubEnv(OPEN);
    const { POST } = await import("../route");
    for (let i = 0; i < 10; i += 1) expect((await POST(post("198.51.100.1", `user${i}@example.test`))).status).toBe(200);
    expect((await POST(post("198.51.100.1", "user99@example.test"))).status).toBe(429);
    expect((await POST(post("198.51.100.2", "user99@example.test"))).status).toBe(200);
  });
});
