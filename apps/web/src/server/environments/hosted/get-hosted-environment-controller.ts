import path from "node:path";
import type { EnvironmentController } from "fluxiq/platform";
import { commerceConfig, getCloudAdmission } from "../../commerce";
import { delegatingCloudAuthorizer } from "../../commerce/cloud";
import type { HostedEnvironmentActor } from "../authority";
import { environmentDriverFromEnv } from "./environment-driver-from-env";

const state = globalThis as typeof globalThis & { __fluxiqHostedEnvironments?: Map<string, Promise<EnvironmentController<HostedEnvironmentActor>>> };
const controllers = state.__fluxiqHostedEnvironments ??= new Map<string, Promise<EnvironmentController<HostedEnvironmentActor>>>();

/**
 * The web server's dedicated-environment controller, composed with the
 * commerce composition's cloud admission (`getCloudAdmission`): a create or
 * start is admitted only by a granted entitlement, counted against the
 * dedicated browsers the account holds. The commerce composition installed
 * the hosted IAM resolver (`setCloudAuthorizer`), which the admission and the
 * controller's stop, delete and read both ask. Null when this server bills nothing:
 * local and self-hosted panels have no hosted environments. Throws, naming
 * the setting, when billing is on but no region, driver or client domain
 * (`FLUXIQ_ENVIRONMENT_CLIENT_DOMAIN`) is configured.
 */
export async function getHostedEnvironmentController(env: Readonly<Record<string, string | undefined>> = process.env): Promise<EnvironmentController<HostedEnvironmentActor> | null> {
  const admission = await getCloudAdmission();
  if (admission === null) return null;
  const { getFluxIQAfterReload } = await import("../../../lib/fluxiq");
  const root = path.resolve((await getFluxIQAfterReload()).paths.fluxiq);
  let pending = controllers.get(root);
  if (!pending) {
    pending = compose(admission, env);
    controllers.set(root, pending);
    void pending.catch(() => { if (controllers.get(root) === pending) controllers.delete(root); });
  }
  return pending;
}

async function compose(admission: NonNullable<Awaited<ReturnType<typeof getCloudAdmission>>>, env: Readonly<Record<string, string | undefined>>): Promise<EnvironmentController<HostedEnvironmentActor>> {
  if ((commerceConfig(env)?.region ?? null) === null) throw new Error("environments.region_unset: no plan grants a dedicated environment, so there is no region to run one in.");
  const driver = environmentDriverFromEnv(env);
  // The domain the runner image's client declares in its hello (the web extension declares web-automation). It is the
  // deployment's to name, never guessed here: a ticket minted for another domain is refused at the gateway.
  const domainId = env.FLUXIQ_ENVIRONMENT_CLIENT_DOMAIN?.trim();
  if (!domainId) throw new Error("environments.domain_unset: FLUXIQ_ENVIRONMENT_CLIENT_DOMAIN names no domain for the dedicated environments' clients.");
  // Loaded on use: a server that bills nothing (the deletion cascade asks every time) never loads the controller and its enrolment.
  const { createEnvironmentController } = await import("../web-controller");
  return createEnvironmentController<HostedEnvironmentActor>({ admission, authorize: delegatingCloudAuthorizer, driver, domainId });
}
