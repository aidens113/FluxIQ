import { mkdtemp, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseCloudConfig } from "../../../config/index.ts";
import { buildCloudPlan } from "../../../plan/index.ts";
import type { PinnedAnswer, PinnedCall } from "../../pinned-https.ts";
import { signStripeWebhook } from "../../sign-stripe-webhook.ts";

// Test support for the smoke checks: the example service plan with a known
// webhook secret, and a stand-in for Core's routes that verifies the
// signature as Stripe's SDK does and answers as the routes do.

const examples = fileURLToPath(new URL("../../../../examples/", import.meta.url));
export const SECRET = "whsec_unit_test_secret";

/** The example local service plan, its webhook secret file holding `SECRET`. */
export async function planWithSecret() {
  const config = parseCloudConfig(readFileSync(`${examples}local.config.json`, "utf8"), `${examples}local.config.json`);
  const plan = buildCloudPlan(config, "0.1.0");
  const file = path.join(await mkdtemp(path.join(tmpdir(), "hcco-webhook-")), "webhook-secret");
  await writeFile(file, `${SECRET}\n`, "utf8");
  return { ...plan, secrets: plan.secrets.map((secret) => (secret.name === "stripe_webhook_secret" ? { ...secret, file } : secret)) };
}

/** Answers one verified call: the route's status and JSON body. */
export type FakeRoute = (call: PinnedCall) => { status: number; body: unknown };

/** A Core whose webhook refuses a bad signature with 400 and hands every other call to `route`. */
export function fakeCore(route: FakeRoute) {
  const calls: PinnedCall[] = [];
  const https = async (call: PinnedCall): Promise<PinnedAnswer> => {
    calls.push(call);
    if (call.path.endsWith("/webhook")) {
      const body = call.body ?? "";
      const header = call.headers?.["stripe-signature"] ?? "";
      const seconds = Number(/t=(\d+)/u.exec(header)?.[1]);
      if (header !== signStripeWebhook(body, SECRET, seconds)) return { status: 400, sessionPairs: [], body: JSON.stringify({ error: { code: "commerce.unverified" } }) };
    }
    const answer = route(call);
    return { status: answer.status, sessionPairs: [], body: JSON.stringify(answer.body) };
  };
  return { https, calls };
}
