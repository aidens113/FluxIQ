import { DOCKER_ENVIRONMENT_LABELS } from "./labels.ts";
import type { DockerEnvironmentDriverOptions } from "./types.ts";

/** Where the runner image keeps an environment's browser profile: the environment's one named volume. */
const RUNNER_PROFILE_DIR = "/profile";

/**
 * The `docker create` arguments of one environment's runner: labelled for
 * its project and environment, on the runners network, with no published
 * port and no host mount, every capability dropped, `no-new-privileges`, a
 * read-only root filesystem except the profile volume and two small tmpfs
 * folders (`/tmp`, and `/run/fluxiq` where the runner listens for its
 * enrolment relay), and the plan's memory, CPU and process limits. Its
 * environment says only how to reach the public origin; the enrolment ticket
 * is never here, since `docker inspect` shows all of it.
 */
export function runnerCreateArgs(options: DockerEnvironmentDriverOptions, names: { container: string; volume: string }, environmentId: string, authority: string | null): string[] {
  const { reach, limits } = options;
  const env: [string, string][] = [
    ["FLUXIQ_RUNNER_ENVIRONMENT", environmentId],
    ["FLUXIQ_RUNNER_CORE_URL", reach.publicOrigin],
    ["FLUXIQ_RUNNER_GATEWAY_URL", reach.gatewayUrl],
    ["FLUXIQ_RUNNER_PROFILE_DIR", RUNNER_PROFILE_DIR]
  ];
  if (reach.resolveOriginTo !== null) env.push(["FLUXIQ_RUNNER_RESOLVE_ORIGIN_TO", reach.resolveOriginTo]);
  if (authority !== null) env.push(["FLUXIQ_RUNNER_AUTHORITY", authority]);
  return [
    "create",
    "--name", names.container,
    "--label", `${DOCKER_ENVIRONMENT_LABELS.project}=${options.project}`,
    "--label", `${DOCKER_ENVIRONMENT_LABELS.environment}=${environmentId}`,
    "--label", `${DOCKER_ENVIRONMENT_LABELS.role}=environment`,
    "--network", options.network,
    // Only Docker Desktop names the host by itself; a Linux server needs it said.
    "--add-host", "host.docker.internal:host-gateway",
    "--read-only",
    "--tmpfs", "/tmp:rw,nosuid,nodev,size=512m",
    "--tmpfs", "/run/fluxiq:rw,nosuid,nodev,noexec,size=1m,mode=0700,uid=1000,gid=1000",
    "--mount", `type=volume,source=${names.volume},target=${RUNNER_PROFILE_DIR}`,
    "--shm-size", "256m",
    "--cap-drop", "ALL",
    "--security-opt", "no-new-privileges:true",
    "--memory", limits.memory,
    "--cpus", limits.cpus,
    "--pids-limit", String(limits.pids),
    "--init",
    "--stop-timeout", String(options.stopTimeoutSeconds),
    ...env.flatMap(([name, value]) => ["--env", `${name}=${value}`]),
    options.image
  ];
}
