import { randomBytes } from "node:crypto";
import type { CloudPlan } from "../../plan/index.ts";
import { expectStatus } from "../expect-status.ts";
import type { pinnedHttps } from "../pinned-https.ts";
import { STRIPE_MOCK_SUBSCRIPTION } from "../stripe-mock-fixture.ts";
import { webhookPoster } from "./webhook-poster.ts";

/**
 * The billing webhook, posted to as Stripe posts (no cookie, no Origin, the
 * signature header over the exact body), three ways:
 *
 * 1. an event that names no subscription, signed with the generated secret:
 *    accepted and ignored, with no provider call;
 * 2. an event that names stripe-mock's fixture subscription, signed the same
 *    way: the signature verifies and billing fetches the subscription from
 *    the payments API (stripe-mock), but no FluxIQ checkout record binds it
 *    to an account yet, so nothing is recorded and the delivery answers 200
 *    `unbound`. Billing never takes the account from the provider's echo;
 *    the checkout journey binds this subscription through its checkout;
 * 3. the first body signed with another secret: refused with 400.
 *
 * Answers a sentence saying what was observed.
 */
export async function checkWebhook(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan): Promise<string> {
  const post = await webhookPoster(https, plan);
  const run = randomBytes(8).toString("hex");

  const ping = JSON.stringify({ id: `evt_smoke_ping_${run}`, object: "event", type: "ping.smoke", data: { object: { object: "ping" } } });
  const ignored = await post(ping);
  expectStatus(ignored, 200, `POST ${post.path} (no subscription) signed with the generated secret`);
  const received = JSON.parse(ignored.body) as { received?: boolean; outcome?: string };
  if (received.received !== true || received.outcome !== "ignored") throw new Error(`The webhook did not ignore an event naming no subscription: ${ignored.body.slice(0, 300)}`);

  const subscription = JSON.stringify({ id: `evt_smoke_sub_${run}`, object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: STRIPE_MOCK_SUBSCRIPTION } } });
  const asked = await post(subscription);
  expectStatus(asked, 200, `POST ${post.path} (names a subscription no checkout binds) signed with the generated secret`);
  const unbound = JSON.parse(asked.body) as { outcome?: string };
  if (unbound.outcome !== "unbound") throw new Error(`The webhook recorded a subscription no FluxIQ checkout binds: ${asked.body.slice(0, 300)}`);

  const wrong = await post(ping, "wrong");
  expectStatus(wrong, 400, `POST ${post.path} signed with another secret`);
  return "an event naming no subscription was accepted and ignored; one naming a subscription no checkout binds was fetched from the payments API and recorded nothing (200 unbound); the same body with a wrong signature was refused (400)";
}
