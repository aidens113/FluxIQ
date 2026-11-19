import { DockerCli, type DriverContext } from "../../../drivers/index.ts";
import type { CloudPlan } from "../../../plan/index.ts";
import type { pinnedHttps } from "../../pinned-https.ts";
import { environmentCall as call } from "./call.ts";
import { environmentDocker } from "./docker.ts";

const ENVIRONMENTS_PATH = "/api/platform/v1/environments";

/**
 * The account deletion cascade over a running dedicated browser: the account
 * creates one, then is deleted through the provisioning listener, and the
 * purge removes the container and its volume.
 */
export async function checkAccountPurge(https: ReturnType<typeof pinnedHttps>, plan: CloudPlan, context: DriverContext, session: readonly string[], deleteAccount: () => Promise<string>): Promise<string> {
  const docker = new DockerCli(context.runner);
  const created = await call(https, session, "POST", ENVIRONMENTS_PATH, { operationId: `smoke-purge-${Date.now().toString(36)}` });
  const environmentId = created.body.environment?.environmentId;
  if (created.status !== 200 || environmentId === undefined) throw new Error(`Creating a browser before the account's deletion answered ${created.status} ${JSON.stringify(created.body)}.`);
  if ((await environmentDocker.containers(docker, plan, environmentId)).length !== 1) throw new Error(`Environment ${environmentId} has no container before the account's deletion.`);
  const outcome = await deleteAccount();
  const end = Date.now() + 120_000;
  for (;;) {
    const left = await environmentDocker.resources(docker, plan, environmentId);
    if (left === "") return `the account was deleted (${outcome}) while its browser ${environmentId} ran, and the purge removed its container and volume`;
    if (Date.now() > end) throw new Error(`Two minutes after the account's deletion (${outcome}), environment ${environmentId} still has ${left}.`);
    await context.sleep(2000);
  }
}
