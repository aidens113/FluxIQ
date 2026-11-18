import type { CommandRunner } from "../command/index.ts";
import type { CloudConfig, CloudDriverName } from "../config/index.ts";
import type { CloudPlan } from "../plan/index.ts";
import type { CloudState } from "../state/index.ts";

/** What a driver works with: the command runner, a line logger, a sleep, and the platform it runs on. */
export type DriverContext = {
  runner: CommandRunner;
  log(line: string): void;
  sleep(ms: number): Promise<void>;
  platform: NodeJS.Platform;
};

/** `up --build` rebuilds Core's image even when it exists. */
export type UpOptions = { build: boolean };

/**
 * `keepData` keeps the volumes, the generated secrets that seal them and the
 * state (a restart that keeps accounts); `keepImages` keeps the built and
 * pulled images (so the next `up` does not rebuild).
 */
export type DownOptions = { keepData: boolean; keepImages: boolean };

/** What `down` removed, by kind, and anything it left with the reason. */
export type DownReport = {
  removed: { containers: number; networks: number; volumes: number; images: number; files: number };
  kept: string[];
};

/** One service as `status` shows it. */
export type ServiceStatus = {
  service: string;
  state: string;
  health: string | null;
  ports: string;
};

/** A deployment's status: each service, the URLs, and how many labelled resources exist. */
export type CloudStatus = {
  project: string;
  phase: CloudState["phase"];
  dockerRunning: boolean;
  services: ServiceStatus[];
  urls: { panel: string; mail: string | null };
  labelled: { containers: number; networks: number; volumes: number; images: number };
};

/**
 * Where a deployment runs. `plan` decides everything from the config; `up`
 * makes the plan real and answers the recorded state; `down` removes what a
 * state records plus everything carrying the project label; `status` reports.
 * All are idempotent: a second `up` changes nothing, `down` on nothing succeeds.
 */
export type PlatformDriver = {
  readonly name: CloudDriverName;
  plan(config: CloudConfig): CloudPlan;
  up(plan: CloudPlan, options: UpOptions): Promise<CloudState>;
  down(state: CloudState, options: DownOptions): Promise<DownReport>;
  status(state: CloudState): Promise<CloudStatus>;
};
