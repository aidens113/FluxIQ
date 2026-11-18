import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, expect, it } from "vitest";
import { StripePaymentProvider } from "..";
import type { CommercePlanCatalog } from "../../types";

// What the adapter asks Stripe for, captured by a local HTTP listener on an
// ephemeral loopback port that answers as Stripe would. No network beyond it.
const plans: CommercePlanCatalog = {
  team: {
    name: "Team",
    lines: [
      { priceId: "price_browser", unit: "dedicated-browser", quantity: 2, grants: [{ key: "cloud.dedicated", allocation: "dedicated", capabilities: ["environment.dedicated"], regions: ["region-a"] }] },
      { priceId: "price_seat", unit: "seat", quantity: 5, grants: [{ key: "cloud.shared", allocation: "shared", capabilities: ["execute"], regions: ["region-a"] }] }
    ]
  }
};
const requests: { method: string; path: string; body: URLSearchParams }[] = [];
const answers: Record<string, { status: number; body: unknown }> = {};
const server = createServer((request, response) => {
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    const path = request.url ?? "";
    requests.push({ method: request.method ?? "", path, body: new URLSearchParams(Buffer.concat(chunks).toString("utf8")) });
    const answer = answers[`${request.method} ${path}`] ?? { status: 404, body: { error: { type: "invalid_request_error", code: "resource_missing", message: "No such thing" } } };
    response.writeHead(answer.status, { "content-type": "application/json" });
    response.end(JSON.stringify(answer.body));
  });
});
let provider: StripePaymentProvider;

beforeAll(async () => {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;
  provider = new StripePaymentProvider({ secretKey: "sk_test_local_only", webhookSecret: "whsec_local_test_only_value", plans, apiBaseUrl: `http://127.0.0.1:${port}`, checkoutLifetimeMs: 3_600_000, now: () => 1_700_000_000_000 });
});
afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

it("sells every line of the plan with its configured quantity, with FluxIQ's expiry and the account in metadata", async () => {
  answers["POST /v1/checkout/sessions"] = { status: 200, body: { id: "cs_1", object: "checkout.session", url: "https://checkout.example.invalid/cs_1", expires_at: 1_700_003_600 } };
  expect(await provider.createCheckout({ accountId: "account-a", planId: "team", successUrl: "https://panel.example.invalid/plans?checkout=success", cancelUrl: "https://panel.example.invalid/plans?checkout=cancel" }))
    .toEqual({ checkoutId: "cs_1", url: "https://checkout.example.invalid/cs_1", expiresAtMs: 1_700_003_600_000 });
  const sent = requests.at(-1)!.body;
  expect([sent.get("mode"), sent.get("expires_at"), sent.get("client_reference_id")]).toEqual(["subscription", "1700003600", "account-a"]);
  expect([sent.get("line_items[0][price]"), sent.get("line_items[0][quantity]"), sent.get("line_items[1][price]"), sent.get("line_items[1][quantity]")]).toEqual(["price_browser", "2", "price_seat", "5"]);
  expect([sent.get("metadata[fluxiq_account_id]"), sent.get("subscription_data[metadata][fluxiq_account_id]")]).toEqual(["account-a", "account-a"]);
});

it("expires an open checkout, and answers one Stripe refuses to expire by its current status", async () => {
  answers["POST /v1/checkout/sessions/cs_open/expire"] = { status: 200, body: { id: "cs_open", object: "checkout.session", status: "expired" } };
  expect(await provider.expireCheckout("cs_open")).toBe("expired");
  const refused = { status: 400, body: { error: { type: "invalid_request_error", message: "Only Checkout Sessions with a status in [\"open\"] can be expired." } } };
  answers["POST /v1/checkout/sessions/cs_paid/expire"] = refused;
  answers["GET /v1/checkout/sessions/cs_paid"] = { status: 200, body: { id: "cs_paid", object: "checkout.session", status: "complete" } };
  expect(await provider.expireCheckout("cs_paid")).toBe("completed");
  answers["POST /v1/checkout/sessions/cs_gone/expire"] = refused;
  answers["GET /v1/checkout/sessions/cs_gone"] = { status: 200, body: { id: "cs_gone", object: "checkout.session", status: "expired" } };
  expect(await provider.expireCheckout("cs_gone")).toBe("expired");
  expect(await provider.expireCheckout("cs_unknown")).toBe("expired");
});
