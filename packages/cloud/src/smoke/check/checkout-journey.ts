import { randomBytes } from "node:crypto";
import type { CloudPlan } from "../../plan/index.ts";
import { expectStatus } from "../expect-status.ts";
import type { pinnedHttps } from "../pinned-https.ts";
import { STRIPE_MOCK_SUBSCRIPTION } from "../stripe-mock-fixture.ts";
import { webhookPoster } from "./webhook-poster.ts";

const CHECKOUT_PATH = "/api/platform/v1/commerce/checkout";

type Status = { ok?: boolean; plans?: { id: string }[]; account?: { state?: string; dedicatedEnvironments?: number; openCheckout?: { planId?: string } | null } | null };

/**
 * The paying journey of a hosted service, as a customer and Stripe would
 * drive it, against the payments API (stripe-mock):
 *
 * 1. the first account, signed in, reads the plans and starts a Checkout of
 *    the plan that sells dedicated browsers: the panel answers the Checkout
 *    URL and the account reads `checkout-pending`;
 * 2. Stripe's signed `checkout.session.completed` (naming that checkout and
 *    the subscription it created) is delivered: billing resolves the
 *    subscription to the account through the checkout FluxIQ recorded
 *    (stripe-mock's subscription carries no account metadata) and writes a
 *    ledger version; the same delivery again is a duplicate, and a signed
 *    subscription update writes the next version;
 * 3. the account's billing now reads the recorded subscription, with no open
 *    checkout. stripe-mock's fixture subscription is set to cancel at the
 *    end of a period that ended in 2000, so the state is `ended` and it
 *    allows no dedicated browser: the smoke proves the account resolution
 *    and the ledger write, not a paid grant, which stripe-mock cannot produce;
 * 4. the second account, which bought nothing, reads no plan and no
 *    dedicated browser.
 *
 * Answers a sentence saying what was observed.
 */
export async function checkCheckoutJourney(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan, sessions: readonly (readonly string[])[]): Promise<string> {
  const [payer, other] = sessions;
  if (payer === undefined || other === undefined) throw new Error("The checkout journey needs two signed-in accounts.");
  const billing = plan.config.billing;
  if (billing === null) throw new Error("The checkout journey needs a billing section.");
  const planId = Object.entries(billing.plans).find(([, entry]) => entry.grants.some((grant) => grant.allocation === "dedicated"))?.[0] ?? Object.keys(billing.plans)[0];
  if (planId === undefined) throw new Error("The billing section names no plan.");
  const status = async (session: readonly string[], label: string): Promise<Status> => {
    const answer = await https({ method: "GET", path: CHECKOUT_PATH, session });
    expectStatus(answer, 200, `GET ${CHECKOUT_PATH} as ${label}`);
    return JSON.parse(answer.body) as Status;
  };

  const before = await status(payer, "the first account");
  if (!before.plans?.some((entry) => entry.id === planId)) throw new Error(`The plans page does not offer ${planId}: ${JSON.stringify(before.plans ?? null)}`);
  const started = await https({ method: "POST", path: CHECKOUT_PATH, session: payer, body: JSON.stringify({ planId }) });
  expectStatus(started, 200, `POST ${CHECKOUT_PATH} for ${planId}`);
  const checkout = (JSON.parse(started.body) as { checkout?: { checkoutId?: string; url?: string } }).checkout;
  if (typeof checkout?.checkoutId !== "string" || !/^https:\/\//u.test(checkout.url ?? "")) throw new Error(`Starting a checkout answered no Checkout URL: ${started.body.slice(0, 300)}`);
  const pending = await status(payer, "the first account");
  if (pending.account?.state !== "checkout-pending" || pending.account.openCheckout?.planId !== planId) throw new Error(`After starting a checkout the account reads ${JSON.stringify(pending.account ?? null)}, not checkout-pending for ${planId}.`);

  const post = await webhookPoster(https, plan);
  const run = randomBytes(8).toString("hex");
  const completed = JSON.stringify({ id: `evt_smoke_done_${run}`, object: "event", type: "checkout.session.completed", data: { object: { object: "checkout.session", id: checkout.checkoutId, subscription: STRIPE_MOCK_SUBSCRIPTION } } });
  const applied = await post(completed);
  expectStatus(applied, 200, `POST ${post.path} (checkout.session.completed)`);
  if ((JSON.parse(applied.body) as { outcome?: string }).outcome !== "applied") throw new Error(`The completed checkout wrote no ledger version: ${applied.body.slice(0, 300)}`);
  const again = await post(completed);
  if ((JSON.parse(again.body) as { outcome?: string }).outcome !== "duplicate") throw new Error(`The completion delivered again was not a duplicate: ${again.body.slice(0, 300)}`);
  const updated = await post(JSON.stringify({ id: `evt_smoke_update_${run}`, object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: STRIPE_MOCK_SUBSCRIPTION } } }));
  if ((JSON.parse(updated.body) as { outcome?: string }).outcome !== "applied") throw new Error(`The subscription update wrote no ledger version: ${updated.body.slice(0, 300)}`);

  const after = await status(payer, "the first account");
  if (after.account?.state !== "ended" || after.account.openCheckout !== null) throw new Error(`After the completion the account reads ${JSON.stringify(after.account ?? null)}; expected stripe-mock's recorded subscription (ended) and no open checkout.`);
  const bystander = await status(other, "the second account");
  if (bystander.account?.state !== "none" || bystander.account.dedicatedEnvironments !== 0) throw new Error(`The account that bought nothing reads ${JSON.stringify(bystander.account ?? null)}.`);
  return `the first account started a Checkout of ${planId} (Checkout URL answered, checkout-pending); the signed completion resolved stripe-mock's subscription to it through FluxIQ's checkout record and wrote a ledger version (duplicate on redelivery, next version on an update), and it reads that subscription (ended: the fixture cancels at the end of a period that ended in 2000); the second account reads no plan and no dedicated browser`;
}
