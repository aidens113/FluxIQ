import type { DriverContext, PlatformDriver } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { runSelfHostedSmoke } from "./self-hosted-smoke.ts";
import { runServiceSmoke } from "./service-smoke.ts";
import type { SmokeStep } from "../smoke-step.ts";

/**
 * The end-to-end check of a local rehearsal, by the deployment's mode: a
 * hosted service (accounts, mail, isolation, billing webhook, restart,
 * teardown) or a self-hosted server (health, discovery, no billing, restart,
 * teardown). Answers each check and what it observed, or throws on the first
 * failure.
 */
export function runSmoke(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<SmokeStep[]> {
  return plan.config.mode === "self-hosted" ? runSelfHostedSmoke(plan, driver, context) : runServiceSmoke(plan, driver, context);
}
