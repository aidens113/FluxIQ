import type { DriverContext, PlatformDriver } from "../drivers/index.ts";
import type { CloudPlan } from "../plan/index.ts";
import { cloudStateStore } from "../state/index.ts";

/** Brings the stack up first when the recorded state says it is not. */
export async function ensureUp(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<void> {
  const state = await cloudStateStore.read(plan.stateFile);
  if (state?.phase === "up") return;
  context.log("smoke: the stack is not up; bringing it up first.");
  await driver.up(plan, { build: false });
}
