import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import type { DriverContext } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { expectStatus } from "../expect-status.ts";
import { fluxiqLogs } from "../fluxiq-logs.ts";
import type { pinnedHttps } from "../pinned-https.ts";
import { secretFile } from "../secret-file.ts";
import { signStripeWebhook } from "../sign-stripe-webhook.ts";

const WEBHOOK_PATH = "/api/platform/v1/commerce/webhook";

/** What Core logs when the provider answered with a subscription that names no FluxIQ account (stripe-mock's fixture does). */
const NO_ACCOUNT = "names no FluxIQ account in its fluxiq_account_id metadata";

/**
 * The billing webhook, posted to as Stripe posts (no cookie, no Origin, the
 * signature header over the exact body), three ways:
 *
 * 1. an event that names no subscription, signed with the generated secret:
 *    accepted and ignored, with no provider call;
 * 2. an event that names a subscription, signed the same way: the signature
 *    verifies, and billing asks the payments API (stripe-mock) for the
 *    subscription. stripe-mock answers with its fixture subscription, which
 *    names no FluxIQ account, so billing refuses to record it: the delivery
 *    answers 500 `commerce.failed` and Core's log names exactly that reason.
 *    That is the observable proof that the provider was called and its answer
 *    parsed. No ledger version is written, since the fixture is not the
 *    subscription of any account (a real one carries fluxiq_account_id);
 * 3. the first body signed with another secret: refused with 400.
 *
 * Answers a sentence saying what was observed.
 */
export async function checkWebhook(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan, context: DriverContext): Promise<string> {
  const secret = (await readFile(secretFile(plan, "stripe_webhook_secret"), "utf8")).trim();
  const now = Math.floor(Date.now() / 1000);
  const post = (body: string, signedWith: string) => https({ method: "POST", path: WEBHOOK_PATH, body, headers: { "stripe-signature": signStripeWebhook(body, signedWith, now) }, withOrigin: false });
  const run = randomBytes(8).toString("hex");

  const ping = JSON.stringify({ id: `evt_smoke_ping_${run}`, object: "event", type: "ping.smoke", data: { object: { object: "ping" } } });
  const ignored = await post(ping, secret);
  expectStatus(ignored, 200, `POST ${WEBHOOK_PATH} (no subscription) signed with the generated secret`);
  const received = JSON.parse(ignored.body) as { received?: boolean; outcome?: string };
  if (received.received !== true || received.outcome !== "ignored") throw new Error(`The webhook did not ignore an event naming no subscription: ${ignored.body.slice(0, 300)}`);

  const subscription = JSON.stringify({ id: `evt_smoke_sub_${run}`, object: "event", type: "customer.subscription.updated", data: { object: { object: "subscription", id: `sub_smoke_${run}` } } });
  const asked = await post(subscription, secret);
  expectStatus(asked, 500, `POST ${WEBHOOK_PATH} (names a subscription) signed with the generated secret`);
  if ((JSON.parse(asked.body) as { error?: { code?: string } }).error?.code !== "commerce.failed") throw new Error(`The subscription event failed for another reason than the provider's answer: ${asked.body.slice(0, 300)}`);
  if (!(await fluxiqLogs(plan, context)).includes(NO_ACCOUNT)) {
    throw new Error(`Core's log does not show that billing fetched the subscription from ${plan.config.payments?.apiBase ?? "the payments API"} and refused it (expected "${NO_ACCOUNT}").`);
  }

  const wrong = await post(ping, `${secret}-wrong`);
  expectStatus(wrong, 400, `POST ${WEBHOOK_PATH} signed with another secret`);
  return "an event naming no subscription was accepted and ignored; one naming a subscription made billing fetch it from the payments API and refuse stripe-mock's fixture (it names no FluxIQ account: 500, and Core's log says so); the same body with a wrong signature was refused (400)";
}
