import { afterEach, describe, expect, it } from "vitest";
import { throttleForm } from "../throttle-form";
import { trustedClientAddress } from "../trusted-client-address";

const limit = { max: 2, windowMs: 60_000 };
let scopeId = 0;
const scope = () => `test-${scopeId++}`;

afterEach(() => {
  delete process.env.FLUXIQ_TRUST_PROXY;
});

describe("throttleForm", () => {
  it("allows up to the limit, then answers 429 with retry-after", async () => {
    const s = scope();
    const check = [{ name: "address", key: "203.0.113.1", limit }];
    expect(throttleForm(s, check)).toBeNull();
    expect(throttleForm(s, check)).toBeNull();
    const refused = throttleForm(s, check);
    expect(refused?.status).toBe(429);
    expect(Number(refused?.headers.get("retry-after"))).toBeGreaterThan(0);
    await expect(refused?.json()).resolves.toEqual({ ok: false, code: "rate_limited" });
  });

  it("keeps keys apart, so one key never locks out another", () => {
    const s = scope();
    for (let i = 0; i < 5; i += 1) throttleForm(s, [{ name: "address", key: "203.0.113.1", limit }]);
    expect(throttleForm(s, [{ name: "address", key: "203.0.113.2", limit }])).toBeNull();
  });

  it("skips a null key", () => {
    const s = scope();
    for (let i = 0; i < 10; i += 1) expect(throttleForm(s, [{ name: "address", key: null, limit }])).toBeNull();
  });

  it("trusts a forwarded address only with FLUXIQ_TRUST_PROXY", () => {
    const request = new Request("http://x/", { headers: { "x-forwarded-for": "203.0.113.7" } });
    expect(trustedClientAddress(request)).toBeNull();
    process.env.FLUXIQ_TRUST_PROXY = "true";
    expect(trustedClientAddress(request)).toBe("203.0.113.7");
    expect(trustedClientAddress(new Request("http://x/"))).toBeNull();
  });
});
