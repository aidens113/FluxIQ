import type { DockerCli } from "../../../drivers/index.ts";
import { CLOUD_PROJECT_LABEL, type CloudPlan } from "../../../plan/index.ts";

const ENVIRONMENT_LABEL = "com.fluxiq.cloud.environment";

async function containers(docker: DockerCli, plan: CloudPlan, environmentId: string): Promise<{ id: string; state: string }[]> {
  const stdout = await docker.must(["ps", "--all", "--no-trunc", "--filter", `label=${CLOUD_PROJECT_LABEL}=${plan.project}`, "--filter", `label=${ENVIRONMENT_LABEL}=${environmentId}`, "--format", "{{.ID}} {{.State}}"], `Listing environment ${environmentId}'s containers`);
  return stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).map((line) => {
    const [id = "", state = ""] = line.split(/\s+/u);
    return { id, state };
  });
}

/** What Docker still holds of an environment ("" for nothing). */
async function resources(docker: DockerCli, plan: CloudPlan, environmentId: string): Promise<string> {
  const found = await containers(docker, plan, environmentId);
  const volumes = (await docker.must(["volume", "ls", "--quiet", "--filter", `label=${CLOUD_PROJECT_LABEL}=${plan.project}`, "--filter", `label=${ENVIRONMENT_LABEL}=${environmentId}`], `Listing environment ${environmentId}'s volumes`)).trim();
  return [found.length > 0 ? `${found.length} container(s)` : "", volumes !== "" ? "its profile volume" : ""].filter(Boolean).join(" and ");
}

/** What Docker holds of one environment of the deployment, found by its labels: its containers, and a description of whatever is left. */
export const environmentDocker = { containers, resources };
