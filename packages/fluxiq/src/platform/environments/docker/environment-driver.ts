import type { EnvironmentDriverObservation } from "../model/index.ts";
import type { EnvironmentDriver, EnvironmentDriverSpec, EnvironmentEnrolmentTickets } from "../runtime/index.ts";
import { DOCKER_ENVIRONMENT_LABELS } from "./labels.ts";
import { dockerEnvironmentNames } from "./names.ts";
import { runnerCreateArgs } from "./runner-create-args.ts";
import type { DockerCommandResult, DockerEnvironmentDriverOptions } from "./types.ts";

const ENROL_COMMAND = Object.freeze(["fluxiq-runner", "enrol"]);
/** What the runner's relay prints when it needs a ticket, and once its client is connected. */
const ASKS_FOR_TICKET = "ticket";
const CONNECTED = "connected";

/**
 * The `docker` driver (interface I5), the local simulation of production:
 * one container per environment from the runner image, named
 * `<project>-env-<environmentId>`, on `<project>_runners`, with one named
 * volume for its browser profile. Both carry the project and environment
 * labels, and `inspect` and `release` find them by those labels alone, so no
 * handle is stored and a restarted engine can always ask.
 *
 * `allocate` creates the volume and the container without starting it (one
 * without the other is `partial`); `start` starts the container and relays
 * enrolment tickets to its runner over the standard input of a `docker exec`,
 * so a ticket is never in an argument, a label, the container's environment
 * or anything `docker inspect` shows; `release` force-removes the container
 * and then the volume. Docker reports a stopped and a crashed container alike
 * (`exited`), so both are `stopped`; the controller starts either when its
 * environment should run.
 */
export class DockerEnvironmentDriver implements EnvironmentDriver {
  readonly kind = "docker" as const;
  private readonly options: DockerEnvironmentDriverOptions;
  private readonly enrolCommand: readonly string[];

  constructor(options: DockerEnvironmentDriverOptions) {
    if (!Number.isSafeInteger(options.stopTimeoutSeconds) || options.stopTimeoutSeconds < 1) throw new TypeError("Invalid stop timeout");
    if (!Number.isSafeInteger(options.limits.pids) || options.limits.pids < 1) throw new TypeError("Invalid process limit");
    dockerEnvironmentNames(options.project, "probe");
    this.options = options;
    this.enrolCommand = options.enrolCommand ?? ENROL_COMMAND;
  }

  async inspect(spec: EnvironmentDriverSpec): Promise<EnvironmentDriverObservation> {
    const [containers, volumes] = await Promise.all([this.containers(spec), this.volumes(spec)]);
    if (containers.length === 0 && volumes.length === 0) return "absent";
    if (containers.length !== 1 || volumes.length !== 1) return "partial";
    const state = containers[0]!.state;
    if (state === "running") return "running";
    if (state === "created" || state === "exited") return "stopped";
    // paused, restarting, removing or dead: allocated, and not running as it was asked to.
    return "crashed";
  }

  async allocate(spec: EnvironmentDriverSpec): Promise<void> {
    const names = this.names(spec);
    const authority = this.options.reach.readAuthority === null ? null : await this.options.reach.readAuthority();
    await this.must(["volume", "create", ...this.labelArgs(spec), names.volume], `Creating environment ${spec.environmentId}'s profile volume`);
    await this.must(runnerCreateArgs(this.options, names, spec.environmentId, authority), `Creating environment ${spec.environmentId}'s container`);
  }

  async start(spec: EnvironmentDriverSpec, enrolment?: EnvironmentEnrolmentTickets): Promise<void> {
    if (enrolment === undefined) throw new Error(`Environment ${spec.environmentId} cannot start a runner without an enrolment ticket source.`);
    const { container } = this.names(spec);
    await this.must(["start", container], `Starting environment ${spec.environmentId}`);
    let enrolled: DockerCommandResult;
    try {
      enrolled = await this.options.docker.converse(["exec", "--interactive", container, ...this.enrolCommand], (line) =>
        line.trim() === ASKS_FOR_TICKET ? enrolment.takeEnrolmentTicket() : undefined);
    } catch (error) {
      await this.stopAfterFailedEnrolment(container);
      throw error;
    }
    if (enrolled.code !== 0 || !lines(enrolled.stdout).includes(CONNECTED)) {
      // A runner that never enrolled must not look converged: stopped, a later start or reconcile enrols it afresh.
      await this.stopAfterFailedEnrolment(container);
      throw new Error(`Environment ${spec.environmentId}'s runner did not enrol at its gateway (exit ${enrolled.code}).${tail(enrolled.stderr)}`);
    }
  }

  async stop(spec: EnvironmentDriverSpec): Promise<void> {
    for (const container of await this.containers(spec)) {
      await this.must(["stop", "--time", String(this.options.stopTimeoutSeconds), container.id], `Stopping environment ${spec.environmentId}`);
    }
  }

  async release(spec: EnvironmentDriverSpec): Promise<void> {
    const containers = await this.containers(spec);
    if (containers.length > 0) await this.must(["rm", "--force", ...containers.map((container) => container.id)], `Removing environment ${spec.environmentId}'s container`);
    const volumes = await this.volumes(spec);
    if (volumes.length > 0) await this.must(["volume", "rm", "--force", ...volumes], `Removing environment ${spec.environmentId}'s profile volume`);
  }

  private async stopAfterFailedEnrolment(container: string): Promise<void> {
    await this.options.docker.run(["stop", "--time", String(this.options.stopTimeoutSeconds), container]);
  }

  private async containers(spec: EnvironmentDriverSpec): Promise<{ id: string; state: string }[]> {
    const stdout = await this.must(["ps", "--all", "--no-trunc", ...this.filterArgs(spec), "--format", "{{.ID}} {{.State}}"], `Listing environment ${spec.environmentId}'s container`);
    return lines(stdout).map((line) => {
      const [id = "", state = ""] = line.split(/\s+/u);
      return { id, state: state.toLowerCase() };
    }).filter((entry) => entry.id !== "");
  }

  private async volumes(spec: EnvironmentDriverSpec): Promise<string[]> {
    return lines(await this.must(["volume", "ls", "--quiet", ...this.filterArgs(spec)], `Listing environment ${spec.environmentId}'s profile volume`));
  }

  private filterArgs(spec: EnvironmentDriverSpec): string[] {
    this.names(spec);
    return [
      "--filter", `label=${DOCKER_ENVIRONMENT_LABELS.project}=${this.options.project}`,
      "--filter", `label=${DOCKER_ENVIRONMENT_LABELS.environment}=${spec.environmentId}`
    ];
  }

  private labelArgs(spec: EnvironmentDriverSpec): string[] {
    return [
      "--label", `${DOCKER_ENVIRONMENT_LABELS.project}=${this.options.project}`,
      "--label", `${DOCKER_ENVIRONMENT_LABELS.environment}=${spec.environmentId}`,
      "--label", `${DOCKER_ENVIRONMENT_LABELS.role}=environment`
    ];
  }

  private names(spec: EnvironmentDriverSpec): { container: string; volume: string } {
    return dockerEnvironmentNames(this.options.project, spec.environmentId);
  }

  private async must(args: readonly string[], step: string): Promise<string> {
    const result = await this.options.docker.run(args);
    if (result.code !== 0) throw new Error(`${step} failed (docker exited ${result.code}).${tail(result.stderr)}`);
    return result.stdout;
  }
}

function lines(text: string): string[] {
  return text.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
}

function tail(stderr: string): string {
  const last = lines(stderr).slice(-4);
  return last.length === 0 ? "" : ` ${last.join(" | ")}`;
}
