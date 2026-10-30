import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const submitWelcome = vi.hoisted(() => vi.fn());
vi.mock("../../../../lib/fluxiq", () => ({ getFluxIQ: () => ({ programs: { identityAccess: {}, secretKeys: {} } }) }));
vi.mock("../../../../server/provisioning-listener", () => ({ getPlatformServices: async () => ({ links: {}, provisioning: {} }) }));
vi.mock("../../server", () => ({ submitWelcome, toAccountLinkHttp: () => new Response("{}", { status: 200 }) }));

beforeEach(() => {
  vi.resetModules();
  process.env.FLUXIQ_TRUST_PROXY = "true";
});
afterEach(() => {
  delete process.env.FLUXIQ_TRUST_PROXY;
});

const post = (address: string) => new Request("http://x/welcome/submit", { method: "POST", headers: { "x-forwarded-for": address }, body: "{}" });

describe("welcome submit throttle", () => {
  it("answers 429 with retry-after past 20 requests from one address, and not for another", async () => {
    const { POST } = await import("../route");
    for (let i = 0; i < 20; i += 1) expect((await POST(post("203.0.113.1"))).status).toBe(200);
    const refused = await POST(post("203.0.113.1"));
    expect(refused.status).toBe(429);
    expect(Number(refused.headers.get("retry-after"))).toBeGreaterThan(0);
    expect((await POST(post("203.0.113.2"))).status).toBe(200);
  });
});
