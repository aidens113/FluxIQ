import { mkdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import type { FluxIQHostLauncher, FluxIQLaunchedHost } from "../../../server/managed-hosts/index.ts";
import { environmentHostId } from "../enrolment/index.ts";
import { ENVIRONMENT_ID_PATTERN } from "../model/index.ts";
import type { EnvironmentDriverObservation } from "../model/index.ts";
import type { EnvironmentDriver, EnvironmentDriverSpec, EnvironmentEnrolmentTickets } from "./types.ts";

export type LocalProcessEnvironmentDriverOptions = {
  /** The managed host launcher `fluxiq dev --browsers` loads (`loadManagedHostLauncher`). */
  launcher: FluxIQHostLauncher;
  /** Each environment's profile lives in `<dataDir>/<environmentId>`. */
  dataDir: string;
  gatewayUrl: string;
  coreApiUrl: string;
  headless: boolean;
};

type Runner = { host: FluxIQLaunchedHost; controller: AbortController; exited: boolean };

/**
 * The `local-process` driver, for development: one managed host per
 * environment, started through the existing launcher on the engine's own
 * machine, with its own named profile directory, enrolled at its tenant's
 * gateway with the ticket its start was handed. It isolates nothing between
 * tenants, so the hosted service refuses it in the `service` profile.
 *
 * The profile directory is the allocation, found again from the environment
 * id. The process belongs to this engine: a host that went away without being
 * stopped is `crashed`, and after an engine restart an allocated environment
 * is `stopped` until it is started again.
 */
export class LocalProcessEnvironmentDriver implements EnvironmentDriver {
  readonly kind = "local-process" as const;
  private readonly options: LocalProcessEnvironmentDriverOptions;
  private readonly runners = new Map<string, Runner>();

  constructor(options: LocalProcessEnvironmentDriverOptions) {
    this.options = { ...options, dataDir: path.resolve(options.dataDir) };
  }

  async inspect(spec: EnvironmentDriverSpec): Promise<EnvironmentDriverObservation> {
    const allocated = await directoryExists(this.profileDir(spec));
    const runner = this.runners.get(spec.environmentId);
    if (runner === undefined) return allocated ? "stopped" : "absent";
    if (!allocated) return "partial";
    return runner.exited ? "crashed" : "running";
  }

  async allocate(spec: EnvironmentDriverSpec): Promise<void> {
    await mkdir(this.profileDir(spec), { recursive: true });
  }

  async start(spec: EnvironmentDriverSpec, enrolment?: EnvironmentEnrolmentTickets): Promise<void> {
    if (enrolment === undefined) throw new Error(`Environment ${spec.environmentId} cannot start a local process without an enrolment ticket source.`);
    const previous = this.runners.get(spec.environmentId);
    if (previous !== undefined && !previous.exited) return;
    if (previous !== undefined) await this.end(spec.environmentId, previous);
    const dataDir = this.profileDir(spec);
    if (!await directoryExists(dataDir)) throw new Error(`Environment ${spec.environmentId} is not allocated.`);
    const controller = new AbortController();
    const host = await this.options.launcher.launch({
      hostId: environmentHostId(spec.environmentId),
      gatewayUrl: this.options.gatewayUrl,
      coreApiUrl: this.options.coreApiUrl,
      dataDir,
      profile: { kind: "named", name: spec.environmentId },
      headless: this.options.headless,
      takeEnrolmentTicket: () => enrolment.takeEnrolmentTicket(),
      signal: controller.signal
    });
    const runner: Runner = { host, controller, exited: false };
    this.runners.set(spec.environmentId, runner);
    void host.closed.then(
      () => { runner.exited = true; },
      () => { runner.exited = true; }
    );
  }

  async stop(spec: EnvironmentDriverSpec): Promise<void> {
    const runner = this.runners.get(spec.environmentId);
    if (runner !== undefined) await this.end(spec.environmentId, runner);
  }

  async release(spec: EnvironmentDriverSpec): Promise<void> {
    await this.stop(spec);
    await rm(this.profileDir(spec), { recursive: true, force: true });
  }

  /** Stops every runner this engine started, keeping their profiles; for the engine's shutdown. */
  async closeAll(): Promise<void> {
    const outcomes = await Promise.allSettled([...this.runners].map(([environmentId, runner]) => this.end(environmentId, runner)));
    const failed = outcomes.filter((outcome): outcome is PromiseRejectedResult => outcome.status === "rejected");
    if (failed.length > 0) throw new AggregateError(failed.map((failure) => failure.reason), "Some environment processes did not close cleanly.");
  }

  private async end(environmentId: string, runner: Runner): Promise<void> {
    runner.controller.abort(new Error(`Environment ${environmentId} is stopping.`));
    await runner.host.close();
    if (this.runners.get(environmentId) === runner) this.runners.delete(environmentId);
  }

  private profileDir(spec: EnvironmentDriverSpec): string {
    // An id that is not an environment's could name a path outside the data directory.
    if (!ENVIRONMENT_ID_PATTERN.test(spec.environmentId)) throw new TypeError("Invalid environment id");
    return path.join(this.options.dataDir, spec.environmentId);
  }
}

async function directoryExists(directory: string): Promise<boolean> {
  try {
    return (await stat(directory)).isDirectory();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}
