/** What one `docker` command answered. A program that could not be started answers 127. */
export type DockerCommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

/** Answers one line a conversing program printed: text to write to its standard input (a newline is added), or nothing. */
export type DockerLineAnswer = (line: string) => string | undefined;

/**
 * Runs the `docker` command line. Injected, so the driver is testable without
 * Docker. `converse` keeps the program's standard input open and answers each
 * line it prints; that is how a runner is handed its enrolment ticket, so the
 * ticket only ever travels on a standard input stream.
 */
export interface DockerCommandRunner {
  run(args: readonly string[]): Promise<DockerCommandResult>;
  /** Rejects, after ending the program, when `answer` throws. */
  converse(args: readonly string[], answer: DockerLineAnswer): Promise<DockerCommandResult>;
}

/** The resource limits each environment's container runs under. */
export type DockerEnvironmentLimits = {
  /** Docker's `--memory` value, such as `1g`. */
  memory: string;
  /** Docker's `--cpus` value, such as `1`. */
  cpus: string;
  pids: number;
};

/**
 * How a runner reaches its tenant's gateway: through the deployment's public
 * origin, the way a runner on another machine would, never across the
 * runners network.
 */
export type DockerRunnerReach = {
  /** The panel's public origin (`https://app.example.org`). */
  publicOrigin: string;
  /** The gateway's public WebSocket URL (`wss://app.example.org/client`). */
  gatewayUrl: string;
  /**
   * A host the public origin's name is resolved to inside the runner, for a
   * rehearsal whose name only this machine knows (a `.localhost` name,
   * reached at `host.docker.internal`); null where public DNS resolves it.
   */
  resolveOriginTo: string | null;
  /**
   * The certificate authority the runner trusts besides the public ones (a
   * local rehearsal's own root, PEM); read when an environment is allocated,
   * null where the public authorities suffice. Public, never a secret.
   */
  readAuthority: (() => Promise<string>) | null;
};

export type DockerEnvironmentDriverOptions = {
  docker: DockerCommandRunner;
  /** The deployment's project: its label value and the prefix of every name the driver gives. */
  project: string;
  /** The runner image, `fluxiq-cloud/runner:<version>`. */
  image: string;
  /** `<project>_runners`, created by the deployment with traffic between containers disabled. */
  network: string;
  reach: DockerRunnerReach;
  limits: DockerEnvironmentLimits;
  /** How long a stop waits for the runner to close its browser before Docker kills it. */
  stopTimeoutSeconds: number;
  /** The program inside the image that relays enrolment tickets to the runner; `fluxiq-runner enrol` by default. */
  enrolCommand?: readonly string[];
};
