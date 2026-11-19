import { readFile } from "node:fs/promises";
import type { CloudPlan } from "../../plan/index.ts";
import type { PinnedAnswer, pinnedHttps } from "../pinned-https.ts";
import { secretFile } from "../secret-file.ts";
import { signStripeWebhook } from "../sign-stripe-webhook.ts";

const WEBHOOK_PATH = "/api/platform/v1/commerce/webhook";

/** Posts one event body to the billing webhook as Stripe does; `"wrong"` signs it with another secret. */
export type WebhookPost = ((body: string, signedWith?: "generated" | "wrong") => Promise<PinnedAnswer>) & { path: string };

/**
 * A poster for the billing webhook: no cookie, no Origin, the signature
 * header over the exact body, made with the deployment's generated webhook
 * secret read from its secrets folder.
 */
export async function webhookPoster(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan): Promise<WebhookPost> {
  const secret = (await readFile(secretFile(plan, "stripe_webhook_secret"), "utf8")).trim();
  const post = (body: string, signedWith: "generated" | "wrong" = "generated") => {
    const now = Math.floor(Date.now() / 1000);
    const key = signedWith === "generated" ? secret : `${secret}-wrong`;
    return https({ method: "POST", path: WEBHOOK_PATH, body, headers: { "stripe-signature": signStripeWebhook(body, key, now) }, withOrigin: false });
  };
  return Object.assign(post, { path: WEBHOOK_PATH });
}
