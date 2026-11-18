import { DockerCli, type DriverContext, type PlatformDriver } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import { cloudStateStore } from "../../state/index.ts";

/**
 * The final `down`, removing data and images, then a count of what still
 * carries the project label. Answers the counts ("containers 0, ...") and
 * throws when anything is left.
 */
export async function checkTeardown(plan: CloudPlan, driver: PlatformDriver, context: DriverContext): Promise<string> {
  context.log("smoke: final down.");
  await driver.down((await cloudStateStore.read(plan.stateFile)) ?? cloudStateStore.empty(plan), { keepData: false, keepImages: false });
  const docker = new DockerCli(context.runner);
  const left = await Promise.all((["container", "network", "volume", "image"] as const).map(async (kind) => `${kind}s ${(await docker.labelled(kind, plan.project)).length}`));
  if (left.some((entry) => !entry.endsWith(" 0"))) throw new Error(`The final down left labelled resources: ${left.join(", ")}.`);
  return left.join(", ");
}
