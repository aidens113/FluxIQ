import { FakeEnvironmentDriver } from "fluxiq/platform";
import type { EnvironmentDriver } from "fluxiq/platform";

/**
 * The driver the hosted controller allocates with, named by
 * `FLUXIQ_ENVIRONMENT_DRIVER`. Only `fake` is buildable from configuration
 * today (the `docker` and `vm` drivers are later units); the composition
 * refuses it on the `service` profile, so a hosted service has no dedicated
 * environments until a real driver exists. Unset or unknown throws, naming
 * the setting: a controller never runs on a guessed driver.
 */
export function environmentDriverFromEnv(env: Readonly<Record<string, string | undefined>> = process.env): EnvironmentDriver {
  const name = env.FLUXIQ_ENVIRONMENT_DRIVER?.trim();
  if (name === "fake") return new FakeEnvironmentDriver();
  throw new Error(name ? `environments.driver_unknown: FLUXIQ_ENVIRONMENT_DRIVER names "${name}"; only "fake" can be built from configuration.` : "environments.driver_unset: FLUXIQ_ENVIRONMENT_DRIVER names no environment driver.");
}
