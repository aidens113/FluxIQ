import { readFile } from "node:fs/promises";
import type { DriverContext, PlatformDriver } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { checkReady, checkRestart, checkTeardown } from "../check/index.ts";
import { ensureUp } from "../ensure-up.ts";
import { expectStatus } from "../expect-status.ts";
import { pinnedHttps } from "../pinned-https.ts";
import type { SmokeStep } from "../smoke-step.ts";

const WEBHOOK_PATH = "/api/platform/v1/commerce/webhook";

/**
 * The check of a self-hosted server (one company's own, the full base
 * product, no billing and no provisioning), from outside as a client would
 * see it: Core is healthy and ready over TLS pinned to the exported local
 * root; discovery names the self-hosted profile and the wss gateway; billing
 * is off (the commerce webhook is not there); the stack goes down with its
 * data kept and comes back healthy and still self-hosted; and a final `down`
 * leaves no labelled container, network, volume or image. Any failed check
 * throws with what it observed; the stack is then left up for a look.
 */
export async function runSelfHostedSmoke(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<SmokeStep[]> {
  if (plan.exportedCa === null) throw new Error("smoke runs against a local rehearsal: it needs tls.mode \"internal\".");
  const steps: SmokeStep[] = [];
  const pass = (name: string, detail: string) => {
    steps.push({ name, detail });
    context.log(`  ok  ${name}: ${detail}`);
  };
  await ensureUp(plan, driver, context);
  const https = pinnedHttps(plan.publicOrigin, await readFile(plan.exportedCa, "utf8"));
  expectStatus(await https({ method: "GET", path: "/api/health" }), 200, "GET /api/health over TLS");
  await checkReady(https, plan, context);
  pass("tls", `${plan.publicOrigin} answered /api/health and /api/ready with 200, the certificate pinned to the exported local root`);

  await expectDiscovery(https, plan);
  pass("discovery", "/.well-known/fluxiq names the self-hosted profile and the wss gateway on the public origin");

  expectStatus(await https({ method: "POST", path: WEBHOOK_PATH, body: "{}", withOrigin: false }), 404, `POST ${WEBHOOK_PATH} on a self-hosted server`);
  pass("no-billing", "the commerce webhook answers 404: this server bills nothing");

  await checkRestart(plan, driver, context);
  expectStatus(await https({ method: "GET", path: "/api/health" }), 200, "GET /api/health after the restart");
  await checkReady(https, plan, context);
  await expectDiscovery(https, plan);
  pass("restart", "after down (data kept) and up, Core is healthy, ready and still self-hosted");

  pass("teardown", `the final down left nothing labelled ${plan.project} (${await checkTeardown(plan, driver, context)})`);
  return steps;
}

async function expectDiscovery(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan): Promise<void> {
  const answer = await https({ method: "GET", path: "/.well-known/fluxiq" });
  expectStatus(answer, 200, "GET /.well-known/fluxiq");
  const discovery = JSON.parse(answer.body) as { instance?: { profile?: string }; gatewayUrl?: string };
  if (discovery.instance?.profile !== "self-hosted") throw new Error(`Discovery names the profile "${String(discovery.instance?.profile)}", not "self-hosted".`);
  const expected = `wss://${new URL(plan.publicOrigin).host}/client`;
  if (discovery.gatewayUrl !== expected) throw new Error(`Discovery advertises ${String(discovery.gatewayUrl)}, not ${expected}.`);
}
