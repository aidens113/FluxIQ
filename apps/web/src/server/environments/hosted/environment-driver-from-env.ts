import { readFile } from "node:fs/promises";
import { DockerEnvironmentDriver, FakeEnvironmentDriver, nodeDockerCommandRunner } from "fluxiq/platform";
import type { EnvironmentDriver } from "fluxiq/platform";
import { resolveFluxIQDeploymentSettings } from "fluxiq/platform/profile";

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The driver the hosted controller allocates with, named by
 * `FLUXIQ_ENVIRONMENT_DRIVER`:
 *
 * - `docker`: one runner container per environment (the local simulation of
 *   production), configured by `FLUXIQ_ENVIRONMENT_DOCKER_PROJECT`, `_IMAGE`
 *   and `_NETWORK`, with optional limits (`FLUXIQ_ENVIRONMENT_RUNNER_MEMORY`,
 *   `_CPUS`, `_PIDS`, `_STOP_SECONDS`). Runners reach the gateway through the
 *   public origin; a rehearsal whose name only this machine knows names the
 *   host to resolve it to (`FLUXIQ_ENVIRONMENT_RUNNER_RESOLVE_TO`) and the
 *   certificate file its runners trust (`FLUXIQ_ENVIRONMENT_RUNNER_AUTHORITY_FILE`).
 * - `fake`: in memory, for tests and local runs; the composition refuses it
 *   on the `service` profile.
 *
 * Unset, unknown or incomplete throws, naming the setting: a controller never
 * runs on a guessed driver.
 */
export function environmentDriverFromEnv(env: Env = process.env): EnvironmentDriver {
  const name = env.FLUXIQ_ENVIRONMENT_DRIVER?.trim();
  if (name === "fake") return new FakeEnvironmentDriver();
  if (name === "docker") return dockerDriver(env);
  throw new Error(name ? `environments.driver_unknown: FLUXIQ_ENVIRONMENT_DRIVER names "${name}"; only "docker" and "fake" can be built from configuration.` : "environments.driver_unset: FLUXIQ_ENVIRONMENT_DRIVER names no environment driver.");
}

function dockerDriver(env: Env): EnvironmentDriver {
  const settings = resolveFluxIQDeploymentSettings(env);
  const authorityFile = optional(env, "FLUXIQ_ENVIRONMENT_RUNNER_AUTHORITY_FILE");
  return new DockerEnvironmentDriver({
    docker: nodeDockerCommandRunner(),
    project: required(env, "FLUXIQ_ENVIRONMENT_DOCKER_PROJECT"),
    image: required(env, "FLUXIQ_ENVIRONMENT_DOCKER_IMAGE"),
    network: required(env, "FLUXIQ_ENVIRONMENT_DOCKER_NETWORK"),
    reach: {
      publicOrigin: settings.publicOrigin,
      gatewayUrl: settings.gateway.publicUrl,
      resolveOriginTo: optional(env, "FLUXIQ_ENVIRONMENT_RUNNER_RESOLVE_TO"),
      readAuthority: authorityFile === null ? null : async () => {
        const pem = await readFile(authorityFile, "utf8").catch((error: NodeJS.ErrnoException) => {
          throw new Error(`environments.runner_authority_missing: FLUXIQ_ENVIRONMENT_RUNNER_AUTHORITY_FILE (${authorityFile}) could not be read (${error.code ?? "error"}); the deployment exports it once its proxy has a certificate.`);
        });
        if (!pem.includes("BEGIN CERTIFICATE")) throw new Error("environments.runner_authority_invalid: FLUXIQ_ENVIRONMENT_RUNNER_AUTHORITY_FILE holds no certificate.");
        return pem;
      }
    },
    limits: {
      memory: optional(env, "FLUXIQ_ENVIRONMENT_RUNNER_MEMORY") ?? "1g",
      cpus: optional(env, "FLUXIQ_ENVIRONMENT_RUNNER_CPUS") ?? "1",
      pids: count(env, "FLUXIQ_ENVIRONMENT_RUNNER_PIDS", 512)
    },
    stopTimeoutSeconds: count(env, "FLUXIQ_ENVIRONMENT_RUNNER_STOP_SECONDS", 20)
  });
}

function optional(env: Env, name: string): string | null {
  const value = env[name]?.trim();
  return value ? value : null;
}

function required(env: Env, name: string): string {
  const value = optional(env, name);
  if (value === null) throw new Error(`environments.driver_incomplete: the docker driver needs ${name}.`);
  return value;
}

function count(env: Env, name: string, fallback: number): number {
  const value = optional(env, name);
  if (value === null) return fallback;
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1) throw new Error(`environments.driver_incomplete: ${name} must be a whole number of at least 1.`);
  return parsed;
}
