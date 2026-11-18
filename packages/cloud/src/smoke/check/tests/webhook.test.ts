import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { CommandRunner } from "../../../command/index.ts";
import { parseCloudConfig } from "../../../config/index.ts";
import type { DriverContext } from "../../../drivers/index.ts";
import { buildCloudPlan } from "../../../plan/index.ts";
import { checkWebhook } from "../webhook.ts";
import type { PinnedAnswer, PinnedCall } from "../../pinned-https.ts";
import { signStripeWebhook } from "../../sign-stripe-webhook.ts";

const examples = fileURLToPath(new URL("../../../../examples/", import.meta.url));
const SECRET = "whsec_unit_test_secret";
const NO_ACCOUNT_LOG = "[commerce] webhook could not be applied: Stripe subscription sub_xxx names no FluxIQ account in its fluxiq_account_id metadata.";

async function planWithSecret() {
  const config = parseCloudConfig(readFileSync(`${examples}local.config.json`, "utf8"), `${examples}local.config.json`);
  const plan = buildCloudPlan(config, "0.1.0");
  const file = path.join(await mkdtemp(path.join(tmpdir(), "hcc2-webhook-")), "webhook-secret");
  await writeFile(file, `${SECRET}\n`, "utf8");
  return { ...plan, secrets: plan.secrets.map((secret) => (secret.name === "stripe_webhook_secret" ? { ...secret, file } : secret)) };
}

/** A Core that verifies the signature as Stripe's SDK does and answers as the route does. */
function fakeCore(subscriptionAnswers: { status: number; body: unknown }) {
  const calls: PinnedCall[] = [];
  const https = async (call: PinnedCall): Promise<PinnedAnswer> => {
    calls.push(call);
    const body = call.body ?? "";
    const header = call.headers?.["stripe-signature"] ?? "";
    const seconds = Number(/t=(\d+)/u.exec(header)?.[1]);
    if (header !== signStripeWebhook(body, SECRET, seconds)) return { status: 400, sessionPairs: [], body: JSON.stringify({ error: { code: "commerce.unverified" } }) };
    const answer = body.includes('"object":"subscription"') ? subscriptionAnswers : { status: 200, body: { received: true, outcome: "ignored" } };
    return { status: answer.status, sessionPairs: [], body: JSON.stringify(answer.body) };
  };
  return { https, calls };
}

function context(log: string): DriverContext {
  const runner: CommandRunner = { run: async () => ({ code: 0, stdout: log, stderr: "" }) };
  return { runner, log: () => undefined, sleep: async () => undefined, platform: "win32" };
}

describe("checkWebhook", () => {
  it("passes when the event is ignored, the subscription event reaches the provider, and a wrong signature is refused", async () => {
    const { https, calls } = fakeCore({ status: 500, body: { error: { code: "commerce.failed" } } });
    const detail = await checkWebhook(https, await planWithSecret(), context(NO_ACCOUNT_LOG));
    expect(detail).toContain("refused (400)");
    expect(calls).toHaveLength(3);
    expect(calls.every((call) => call.withOrigin === false)).toBe(true);
    expect(calls[1]?.body).toMatch(/"object":"subscription","id":"sub_smoke_/u);
  });

  it("fails when Core's log does not show the provider's answer was read", async () => {
    const { https } = fakeCore({ status: 500, body: { error: { code: "commerce.failed" } } });
    await expect(checkWebhook(https, await planWithSecret(), context("nothing relevant"))).rejects.toThrow(/does not show that billing fetched the subscription/u);
  });

  it("fails when the subscription event is not refused for the provider's answer", async () => {
    const { https } = fakeCore({ status: 200, body: { received: true, outcome: "applied" } });
    await expect(checkWebhook(https, await planWithSecret(), context(NO_ACCOUNT_LOG))).rejects.toThrow(/answered 200, not 500/u);
    const other = fakeCore({ status: 500, body: { error: { code: "commerce.unavailable" } } });
    await expect(checkWebhook(other.https, await planWithSecret(), context(NO_ACCOUNT_LOG))).rejects.toThrow(/another reason/u);
  });
});
