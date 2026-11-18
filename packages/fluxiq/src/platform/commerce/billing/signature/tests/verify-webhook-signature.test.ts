import { createHmac } from "node:crypto";
import { expect, it } from "vitest";
import { signWebhookPayload, verifyWebhookSignature } from "../index.ts";

const secret = "whsec_test_only_local_secret";
const payload = JSON.stringify({ id: "evt_1", type: "customer.subscription.updated" });
const nowMs = 1_800_000_000_000;
const verify = (header: string | null, overrides: { payload?: string; secret?: string; nowMs?: number } = {}) =>
  () => verifyWebhookSignature({ payload: overrides.payload ?? payload, header, secret: overrides.secret ?? secret, nowMs: overrides.nowMs ?? nowMs, toleranceMs: 300_000 });

it("signs with Stripe's v1 scheme, an HMAC-SHA256 of '<t>.<body>'", () => {
  const header = signWebhookPayload(payload, secret, nowMs);
  const expected = createHmac("sha256", secret).update(`${nowMs / 1000}.${payload}`).digest("hex");
  expect(header).toBe(`t=${nowMs / 1000},v1=${expected}`);
  expect(verify(header)).not.toThrow();
});

it("accepts any v1 entry so a rotating secret verifies", () => {
  const good = signWebhookPayload(payload, secret, nowMs).split(",")[1]!;
  expect(verify(`t=${nowMs / 1000},v1=${"0".repeat(64)},${good}`)).not.toThrow();
});

it("refuses a missing header, a wrong secret, a changed body and a malformed header", () => {
  const header = signWebhookPayload(payload, secret, nowMs);
  expect(verify(null)).toThrow(expect.objectContaining({ reason: "missing-signature" }));
  expect(verify(header, { secret: "whsec_another_secret_value" })).toThrow(expect.objectContaining({ reason: "bad-signature" }));
  expect(verify(header, { payload: payload.replace("evt_1", "evt_2") })).toThrow(expect.objectContaining({ reason: "bad-signature" }));
  expect(verify("v1=abc")).toThrow(expect.objectContaining({ reason: "bad-signature" }));
  expect(verify(`t=${nowMs / 1000},v0=${"a".repeat(64)}`)).toThrow(expect.objectContaining({ reason: "bad-signature" }));
});

it("refuses a correctly signed delivery replayed outside the timestamp tolerance", () => {
  const header = signWebhookPayload(payload, secret, nowMs - 301_000);
  expect(verify(header)).toThrow(expect.objectContaining({ reason: "timestamp-outside-tolerance" }));
  expect(verify(signWebhookPayload(payload, secret, nowMs - 299_000))).not.toThrow();
});
