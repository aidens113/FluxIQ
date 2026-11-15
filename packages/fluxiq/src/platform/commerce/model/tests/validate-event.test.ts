import { expect, it } from "vitest";
import { event, grant } from "../../tests/fixtures.ts";
import { commerceEventIdentity, validateCommerceEvent } from "../index.ts";
import type { CommerceSubscriptionSnapshot } from "../index.ts";

it("normalizes field order and copies the complete normalized payload before waiting", () => {
  const original = event("verified-1");
  const copied = validateCommerceEvent(original);
  original.subscription.status = "canceled";
  expect(copied.subscription.status).toBe("active");
  expect(copied.subscription.entitlements).not.toBe(original.subscription.entitlements);
  expect(copied.subscription.entitlements[0]!.capabilities).not.toBe(original.subscription.entitlements[0]!.capabilities);
  const reordered = {
    subscription: copied.subscription,
    payloadSha256: copied.payloadSha256,
    eventId: copied.eventId,
    providerId: copied.providerId,
    kind: copied.kind
  };
  expect(commerceEventIdentity(validateCommerceEvent(reordered))).toBe(commerceEventIdentity(copied));
});

const invalidSnapshots: Partial<CommerceSubscriptionSnapshot>[] = [
  { version: 0 },
  { version: Number.MAX_SAFE_INTEGER + 1 },
  { paidThroughMs: -1 },
  { paidThroughMs: Number.NaN },
  { verifiedAtMs: Number.POSITIVE_INFINITY },
  { accountId: " account-a" },
  { entitlements: [grant({ validUntilMs: 1_000 })] },
  { entitlements: [grant({ capabilities: ["execute", "execute"] })] },
  { entitlements: [grant({ resourceIds: ["unowned"] })] },
  { entitlements: [grant({ allocation: "dedicated", resourceIds: [] })] },
  { entitlements: [grant({ regions: [] })] }
];

it.each(invalidSnapshots)("rejects malformed snapshot %j", (changes) => {
  expect(() => validateCommerceEvent(event("malformed", 1, changes))).toThrow(TypeError);
});

it("refuses unknown fields, unknown state and unsigned/invalid payload identities", () => {
  expect(() => validateCommerceEvent(Object.assign(event("extra"), { checkoutSuccess: true }))).toThrow(TypeError);
  const unknown = event("unknown");
  Object.assign(unknown.subscription, { status: "paid-maybe" });
  expect(() => validateCommerceEvent(unknown)).toThrow(TypeError);
  const noDigest = event("digest");
  noDigest.payloadSha256 = "checkout-success";
  expect(() => validateCommerceEvent(noDigest)).toThrow(TypeError);
});
