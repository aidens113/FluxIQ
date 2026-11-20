import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { signStripeWebhook } from "../sign-stripe-webhook.ts";

describe("signStripeWebhook", () => {
  it("signs `<seconds>.<body>` with HMAC-SHA256 under the secret, in Stripe's header shape", () => {
    const header = signStripeWebhook('{"id":"evt_1"}', "whsec_test", 1_700_000_000);
    const expected = createHmac("sha256", "whsec_test").update('1700000000.{"id":"evt_1"}', "utf8").digest("hex");
    expect(header).toBe(`t=1700000000,v1=${expected}`);
  });

  it("gives another secret another signature", () => {
    expect(signStripeWebhook("{}", "a", 1)).not.toBe(signStripeWebhook("{}", "b", 1));
  });
});
