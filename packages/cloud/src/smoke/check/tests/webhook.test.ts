import { describe, expect, it } from "vitest";
import { checkWebhook } from "../webhook.ts";
import { fakeCore, planWithSecret } from "./fake-core.ts";

const answers = (subscription: { status: number; body: unknown }) => fakeCore((call) => (call.body ?? "").includes('"object":"subscription"') ? subscription : { status: 200, body: { received: true, outcome: "ignored" } });

describe("checkWebhook", () => {
  it("passes when the event is ignored, an unbound subscription records nothing, and a wrong signature is refused", async () => {
    const { https, calls } = answers({ status: 200, body: { received: true, outcome: "unbound" } });
    const detail = await checkWebhook(https, await planWithSecret());
    expect(detail).toContain("refused (400)");
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.withOrigin === false)).toBe(true);
    expect(calls[1]?.body).toMatch(/"object":"subscription","id":"sub_1Pgc6rB7WZ01zgkWNy0Cn5nw"/u);
  });

  it("fails when billing records a subscription no checkout binds, or cannot fetch it", async () => {
    await expect(checkWebhook(answers({ status: 200, body: { received: true, outcome: "applied" } }).https, await planWithSecret())).rejects.toThrow(/no FluxIQ checkout binds/u);
    await expect(checkWebhook(answers({ status: 500, body: { error: { code: "commerce.failed" } } }).https, await planWithSecret())).rejects.toThrow(/500/u);
  });
});
