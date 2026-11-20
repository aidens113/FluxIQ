import { describe, expect, it } from "vitest";
import { checkCheckoutJourney } from "../checkout-journey.ts";
import type { PinnedCall } from "../../pinned-https.ts";
import { fakeCore, planWithSecret } from "./fake-core.ts";

const PAYER = ["fluxiq_session=payer"];
const OTHER = ["fluxiq_session=other"];

/** Core's checkout and webhook routes as a stateful stand-in: what the journey should observe. */
function journeyCore(overrides: { completion?: string; after?: string } = {}) {
  let state: "none" | "pending" | "paid" = "none";
  const deliveries = new Set<string>();
  return fakeCore((call: PinnedCall) => {
    const session = call.session?.[0];
    if (call.path.endsWith("/checkout") && call.method === "GET") {
      const account = session === PAYER[0]
        ? { state: state === "none" ? "none" : state === "pending" ? "checkout-pending" : overrides.after ?? "ended", dedicatedEnvironments: 0, seats: 0, openCheckout: state === "pending" ? { planId: "browser", expiresAtMs: 1 } : null }
        : { state: "none", dedicatedEnvironments: 0, seats: 0, openCheckout: null };
      return { status: 200, body: { ok: true, plans: [{ id: "browser" }, { id: "seat" }, { id: "shared" }], account } };
    }
    if (call.path.endsWith("/checkout")) {
      state = "pending";
      return { status: 200, body: { ok: true, checkout: { checkoutId: "cs_test_fixture", url: "https://checkout.stripe.com/pay/c/cs_test_fixture", expiresAtMs: 1 } } };
    }
    const body = JSON.parse(call.body ?? "{}") as { id: string; type: string };
    if (deliveries.has(body.id)) return { status: 200, body: { received: true, outcome: "duplicate" } };
    deliveries.add(body.id);
    if (body.type === "checkout.session.completed") {
      state = "paid";
      return { status: 200, body: { received: true, outcome: overrides.completion ?? "applied" } };
    }
    return { status: 200, body: { received: true, outcome: "applied" } };
  });
}

describe("checkCheckoutJourney", () => {
  it("passes when the checkout starts, its signed completion is recorded once, and only the payer reads the subscription", async () => {
    const { https, calls } = journeyCore();
    const detail = await checkCheckoutJourney(https, await planWithSecret(), [PAYER, OTHER]);
    expect(detail).toContain("Checkout of browser");
    const completion = calls.find((call) => (call.body ?? "").includes("checkout.session.completed"));
    expect(completion?.body).toMatch(/"id":"cs_test_fixture","subscription":"sub_1Pgc6rB7WZ01zgkWNy0Cn5nw"/u);
    expect(completion?.withOrigin).toBe(false);
    expect(calls.find((call) => call.method === "POST" && call.path.endsWith("/checkout"))?.session).toEqual(PAYER);
  });

  it("fails when the completion is not recorded under the payer", async () => {
    await expect(checkCheckoutJourney(journeyCore({ completion: "unbound" }).https, await planWithSecret(), [PAYER, OTHER])).rejects.toThrow(/wrote no ledger version/u);
    await expect(checkCheckoutJourney(journeyCore({ after: "none" }).https, await planWithSecret(), [PAYER, OTHER])).rejects.toThrow(/expected stripe-mock's recorded subscription/u);
  });
});
