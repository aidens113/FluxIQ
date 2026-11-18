import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CommerceBillingService, FakePaymentProvider, SQLiteCommerceLedger } from "fluxiq/platform";
import { getCommerceBilling } from "../../../../../../../server/commerce";
import { POST } from "../route";

vi.mock("../../../../../../../server/commerce", async (importOriginal) => ({ ...await importOriginal<typeof import("../../../../../../../server/commerce")>(), getCommerceBilling: vi.fn() }));

const SECRET = "whsec_route_test_only_secret";
const roots: string[] = [];
let fake: FakePaymentProvider;
let billing: CommerceBillingService;

beforeEach(async () => {
  vi.clearAllMocks();
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-commerce-route-"));
  roots.push(rootDir);
  fake = new FakePaymentProvider({ webhookSecret: SECRET });
  billing = new CommerceBillingService({ ledger: new SQLiteCommerceLedger({ rootDir }), provider: fake, policy: { allowTrial: false, graceMs: 0, retentionMs: 0 }, refreshAfterMs: 60_000 });
  vi.mocked(getCommerceBilling).mockResolvedValue(billing);
  fake.putSubscription({
    accountId: "account-a",
    customerId: "customer-a",
    subscriptionId: "sub-a",
    status: "active",
    paidThroughMs: Date.now() + 86_400_000,
    cancelAtPeriodEnd: false,
    endedAtMs: null,
    verifiedAtMs: 0,
    entitlements: []
  });
});

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

const post = (rawBody: string, signature: string | null) => POST(new Request("https://app.example.test/api/platform/v1/commerce/webhook", {
  method: "POST",
  headers: signature === null ? {} : { "stripe-signature": signature },
  body: rawBody
}));

describe("the commerce webhook route", () => {
  it("applies a signed delivery once and answers its redelivery as a duplicate", async () => {
    const { rawBody, signature } = fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
    const first = await post(rawBody, signature);
    expect(first.status).toBe(200);
    expect(first.headers.get("cache-control")).toBe("no-store");
    expect(await first.json()).toEqual({ received: true, outcome: "applied" });
    expect(await (await post(rawBody, signature)).json()).toEqual({ received: true, outcome: "duplicate" });
    expect(await billing.getEntitlement("account-a")).toMatchObject({ state: "active" });
  });

  it("refuses an unsigned or forged delivery with 400 and records nothing", async () => {
    const { rawBody, signature } = fake.signedEvent({ id: "evt-1", type: "customer.subscription.created", subscriptionId: "sub-a" });
    expect((await post(rawBody, null)).status).toBe(400);
    expect((await post(rawBody.replace("evt-1", "evt-2"), signature)).status).toBe(400);
    expect(await billing.getEntitlement("account-a")).toMatchObject({ state: "none" });
  });

  it("answers 5xx when the subscription cannot be applied, so the provider delivers again", async () => {
    const { rawBody, signature } = fake.signedEvent({ id: "evt-ghost", type: "customer.subscription.created", subscriptionId: "sub-ghost" });
    const response = await post(rawBody, signature);
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({ error: { code: "commerce.failed", message: "The webhook could not be applied." } });
  });

  it("answers 404 where this server bills nothing", async () => {
    vi.mocked(getCommerceBilling).mockResolvedValue(null);
    expect((await post("{}", "t=1,v1=00")).status).toBe(404);
  });

  it("answers 503 without detail when billing is misconfigured", async () => {
    vi.mocked(getCommerceBilling).mockRejectedValue(new Error("commerce.configuration: plans must name at least one plan."));
    const response = await post("{}", "t=1,v1=00");
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: { code: "commerce.unavailable", message: "Billing is unavailable." } });
  });
});
