import type { DriverContext, PlatformDriver } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { cloudStateStore } from "../../state/index.ts";

/** Takes the stack down with its data and images kept, and brings it up again (nothing is rebuilt). */
export async function checkRestart(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<void> {
  context.log("smoke: down with data kept, then up again.");
  await driver.down((await cloudStateStore.read(plan.stateFile)) ?? cloudStateStore.empty(plan), { keepData: true, keepImages: true });
  await driver.up(plan, { build: false });
}
