import { describe, expect, it, vi } from "vitest";
import { checkAutomationStudioModelKey } from "../check-key.ts";

const VALUE = "synthetic-key-value-123";
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const stub = (...replies: (Response | Error)[]) => vi.fn(async () => {
  const next = replies.shift();
  if (next instanceof Error) throw next;
  return next ?? json(500, {});
});
const urlOf = (mock: ReturnType<typeof stub>, index: number) => String((mock.mock.calls as unknown[][])[index]?.[0]);
const initOf = (mock: ReturnType<typeof stub>, index: number) => (mock.mock.calls as unknown[][])[index]?.[1] as RequestInit;

describe("a free model-key check", () => {
  it("lists Anthropic models with the key header and answers", async () => {
    const fetchImpl = stub(json(200, { data: [] }));
    expect(await checkAutomationStudioModelKey({ provider: "anthropic", value: VALUE, fetch: fetchImpl as unknown as typeof fetch })).toEqual({ outcome: "answered" });
    expect(urlOf(fetchImpl, 0)).toBe("https://api.anthropic.com/v1/models");
    expect(initOf(fetchImpl, 0)).toMatchObject({ method: "GET", headers: { "x-api-key": VALUE, "anthropic-version": expect.any(String) } });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("maps statuses: 401 and 403 refused, 402 and a balance refusal no credit, 5xx and network errors unreachable", async () => {
    const run = async (reply: Response | Error) => (await checkAutomationStudioModelKey({ provider: "anthropic", value: VALUE, fetch: stub(reply) as unknown as typeof fetch })).outcome;
    expect(await run(json(401, {}))).toBe("provider_refused");
    expect(await run(json(403, {}))).toBe("provider_refused");
    expect(await run(json(402, {}))).toBe("no_credit");
    expect(await run(json(400, { error: { message: "Your credit balance is too low" } }))).toBe("no_credit");
    expect(await run(json(500, {}))).toBe("provider_unreachable");
    expect(await run(json(529, {}))).toBe("provider_unreachable");
    expect(await run(new TypeError("fetch failed"))).toBe("provider_unreachable");
    expect(await run(new DOMException("timed out", "TimeoutError"))).toBe("provider_unreachable");
  });

  it("checks DeepSeek models and then its balance with a Bearer key", async () => {
    const fetchImpl = stub(json(200, { data: [] }), json(200, { is_available: true, balance_infos: [{ currency: "USD", total_balance: "4.20" }] }));
    expect(await checkAutomationStudioModelKey({ provider: "deepseek", value: VALUE, fetch: fetchImpl as unknown as typeof fetch })).toEqual({ outcome: "answered" });
    expect([urlOf(fetchImpl, 0), urlOf(fetchImpl, 1)]).toEqual(["https://api.deepseek.com/models", "https://api.deepseek.com/user/balance"]);
    expect(initOf(fetchImpl, 1)).toMatchObject({ headers: { authorization: `Bearer ${VALUE}` } });
  });

  it("says no credit for an unavailable or empty DeepSeek account, refused for a refused key, unreachable for a failed read", async () => {
    const run = async (...replies: (Response | Error)[]) => (await checkAutomationStudioModelKey({ provider: "deepseek", value: VALUE, fetch: stub(...replies) as unknown as typeof fetch })).outcome;
    expect(await run(json(200, {}), json(200, { is_available: false, balance_infos: [{ total_balance: "9" }] }))).toBe("no_credit");
    expect(await run(json(200, {}), json(200, { is_available: true, balance_infos: [{ total_balance: "0.00" }] }))).toBe("no_credit");
    expect(await run(json(200, {}), json(200, { is_available: true, balance_infos: [] }))).toBe("no_credit");
    expect(await run(json(401, {}))).toBe("provider_refused");
    expect(await run(json(200, {}), json(402, {}))).toBe("no_credit");
    expect(await run(json(200, {}), json(503, {}))).toBe("provider_unreachable");
    expect(await run(json(200, {}), new TypeError("fetch failed"))).toBe("provider_unreachable");
  });

  it("never puts the key in a result", async () => {
    for (const reply of [json(401, { error: { message: VALUE } }), json(402, {}), json(500, { error: { message: VALUE } })]) {
      const result = await checkAutomationStudioModelKey({ provider: "anthropic", value: VALUE, fetch: stub(reply) as unknown as typeof fetch });
      expect(JSON.stringify(result)).not.toContain(VALUE);
    }
  });
});
