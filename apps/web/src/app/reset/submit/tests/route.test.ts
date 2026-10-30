import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ links: {} }) }));
vi.mock("../../../welcome/server", () => ({ toAccountLinkHttp: () => new Response("{}", { status: 200 }) }));
vi.mock("../../submitReset", () => ({ submitReset: async () => ({ status: 200, body: { ok: true } }) }));

beforeEach(() => {
  vi.resetModules();
  process.env.FLUXIQ_TRUST_PROXY = "true";
});
afterEach(() => {
  delete process.env.FLUXIQ_TRUST_PROXY;
});

const post = (address: string) => new Request("http://x/reset/submit", { method: "POST", headers: { "x-forwarded-for": address }, body: "{}" });

describe("reset submit throttle", () => {
  it("answers 429 with retry-after past 20 requests from one address", async () => {
    const { POST } = await import("../route");
    for (let i = 0; i < 20; i += 1) expect((await POST(post("203.0.113.1"))).status).toBe(200);
    const refused = await POST(post("203.0.113.1"));
    expect(refused.status).toBe(429);
    expect(refused.headers.get("retry-after")).toBeTruthy();
    expect((await POST(post("203.0.113.9"))).status).toBe(200);
  });

  it("does not throttle by address without a trusted proxy", async () => {
    delete process.env.FLUXIQ_TRUST_PROXY;
    const { POST } = await import("../route");
    for (let i = 0; i < 25; i += 1) expect((await POST(post("203.0.113.1"))).status).toBe(200);
  });
});
