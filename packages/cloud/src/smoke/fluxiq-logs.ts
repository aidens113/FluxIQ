import { DockerCli, type DriverContext } from "../drivers/index.ts";
import type { CloudPlan } from "../plan/index.ts";

/** What Core's container has logged so far, read through the deployment's own Compose files. */
export async function fluxiqLogs(plan: CloudPlan, context: DriverContext): Promise<string> {
  const docker = new DockerCli(context.runner);
  const target = { bundleDir: plan.bundleDir, project: plan.project, composeEnvFile: plan.composeEnvFile, composeFiles: plan.composeFiles };
  const result = await docker.compose(target, ["logs", "--no-color", "--no-log-prefix", "fluxiq"]);
  if (result.code !== 0) throw new Error(`Reading Core's log failed (docker compose exited ${result.code}).`);
  return result.stdout;
}
