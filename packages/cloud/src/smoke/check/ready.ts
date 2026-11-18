import { DockerCli, type DriverContext } from "../../drivers/index.ts";
import type { CloudPlan } from "../../plan/index.ts";
import type { pinnedHttps } from "../pinned-https.ts";

/**
 * Waits until /api/ready answers 200 over TLS. Health turns green before the
 * runtime and the gateway finish starting, so ready may lag; the wait ends
 * only when it answers, or fails when Core's container is no longer running
 * (a stack that stopped will never become ready), never on a timer.
 */
export async function checkReady(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan, context: DriverContext): Promise<void> {
  const docker = new DockerCli(context.runner);
  const target = { bundleDir: plan.bundleDir, project: plan.project, composeEnvFile: plan.composeEnvFile, composeFiles: plan.composeFiles };
  for (;;) {
    const answer = await https({ method: "GET", path: "/api/ready" });
    if (answer.status === 200) return;
    const running = await docker.compose(target, ["ps", "--status", "running", "--quiet", "fluxiq"]);
    if (running.code !== 0 || running.stdout.trim() === "") throw new Error(`Core stopped before /api/ready answered 200 (the last answer was ${answer.status}).`);
    await context.sleep(2000);
  }
}
