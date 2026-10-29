import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ links: {} }) }));
vi.mock("../../../welcome/server", () => ({ toAccountLinkHttp: () => new Response("{}", { status: 200 }) }));
vi.mock("../../requestReset", () => ({ requestReset: async () => ({ status: 200, body: { ok: true } }) }));

beforeEach(() => {
  vi.resetModules();
  process.env.FLUXIQ_TRUST_PROXY = "true";
});
afterEach(() => {
  delete process.env.FLUXIQ_TRUST_PROXY;
});

const post = (address: string, email: string) =>
  new Request("http://x/reset/request", { method: "POST", headers: { "x-forwarded-for": address }, body: JSON.stringify({ email }) });

describe("reset request throttle", () => {
  it("answers 429 past 3 requests for one normalised email, whatever the address", async () => {
    const { POST } = await import("../route");
    expect((await POST(post("203.0.113.1", "Person@Example.test"))).status).toBe(200);
    expect((await POST(post("203.0.113.2", " person@example.test "))).status).toBe(200);
    expect((await POST(post("203.0.113.3", "PERSON@example.test"))).status).toBe(200);
    const refused = await POST(post("203.0.113.4", "person@example.test"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
    expect((await POST(post("203.0.113.4", "other@example.test"))).status).toBe(200);
  });

  it("answers 429 past 10 requests from one address across emails", async () => {
    const { POST } = await import("../route");
    for (let i = 0; i < 10; i += 1) expect((await POST(post("198.51.100.1", `user${i}@example.test`))).status).toBe(200);
    expect((await POST(post("198.51.100.1", "user99@example.test"))).status).toBe(429);
    expect((await POST(post("198.51.100.2", "user99@example.test"))).status).toBe(200);
  });
});
