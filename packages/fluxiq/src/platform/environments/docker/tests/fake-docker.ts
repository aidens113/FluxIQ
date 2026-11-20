import type { DockerCommandResult, DockerCommandRunner, DockerLineAnswer } from "../types.ts";

type Container = { id: string; name: string; labels: Map<string, string>; state: "created" | "running" | "exited" | "dead"; createArgs: string[] };
type Volume = { name: string; labels: Map<string, string> };

/** What the fake runner does when a runner's enrolment relay runs: the lines it prints and how it ends. */
export type FakeRelay = (ask: () => string) => { stdout: string[]; code: number; stderr?: string };

/**
 * A `docker` command line in memory: containers and volumes with labels and
 * states, the `ps`, `volume`, `create`, `start`, `stop`, `rm` and `exec`
 * commands the driver uses, every argument list it was given, and every line
 * written to a conversing program's standard input. A command it does not
 * know fails, so a driver change that needs a new one is loud.
 */
export class FakeDocker implements DockerCommandRunner {
  readonly containers = new Map<string, Container>();
  readonly volumes = new Map<string, Volume>();
  /** Every argument list, in order. */
  readonly calls: string[][] = [];
  /** Every line written to a conversing program's standard input. */
  readonly stdin: string[] = [];
  /** The next failure of a command named by its first argument(s), such as `create` or `volume create`. */
  readonly failures = new Map<string, string>();
  /** How the runner's relay behaves; by default it asks for one ticket and reports connected. */
  relay: FakeRelay = (ask) => {
    ask();
    return { stdout: ["ticket", "connected"], code: 0 };
  };
  private ids = 0;

  async run(args: readonly string[]): Promise<DockerCommandResult> {
    this.calls.push([...args]);
    const failure = this.failure(args);
    if (failure !== null) return { code: 1, stdout: "", stderr: failure };
    return this.execute(args);
  }

  async converse(args: readonly string[], answer: DockerLineAnswer): Promise<DockerCommandResult> {
    this.calls.push([...args]);
    if (args[0] !== "exec") return fail(`converse is only used for exec, not ${args[0]}`);
    const name = args[args.indexOf("--interactive") + 1] ?? "";
    const container = this.byName(name);
    if (container?.state !== "running") return fail(`Error response from daemon: container ${name} is not running`);
    const outcome = this.relay(() => {
      const reply = answer("ticket");
      if (reply === undefined) throw new Error("The driver answered no ticket");
      this.stdin.push(reply);
      return reply;
    });
    for (const line of outcome.stdout) if (line !== "ticket") answer(line);
    return { code: outcome.code, stdout: `${outcome.stdout.join("\n")}\n`, stderr: outcome.stderr ?? "" };
  }

  /** Everything the driver told Docker, plus what `docker inspect` would show of each resource. */
  visibleText(): string {
    const inspect = [...this.containers.values()].map((container) => JSON.stringify({ name: container.name, labels: [...container.labels], args: container.createArgs }));
    const volumes = [...this.volumes.values()].map((volume) => JSON.stringify({ name: volume.name, labels: [...volume.labels] }));
    return [...this.calls.map((call) => call.join(" ")), ...inspect, ...volumes].join("\n");
  }

  /** A running container stops without being asked to. */
  crash(name: string): void {
    const container = this.byName(name);
    if (container === undefined) throw new Error(`No container ${name}`);
    container.state = "exited";
  }

  private failure(args: readonly string[]): string | null {
    for (const key of [args.slice(0, 2).join(" "), args[0] ?? ""]) {
      const message = this.failures.get(key);
      if (message !== undefined) {
        this.failures.delete(key);
        return message;
      }
    }
    return null;
  }

  private execute(args: readonly string[]): DockerCommandResult {
    const [command, ...rest] = args;
    switch (command) {
      case "ps": {
        const matching = [...this.containers.values()].filter((container) => matches(container.labels, filters(rest)));
        return ok(matching.map((container) => `${container.id} ${container.state}`).join("\n"));
      }
      case "volume": return this.volume(rest);
      case "create": return this.create(rest);
      case "start": return this.transition(rest[0], (container) => { container.state = "running"; });
      case "stop": return this.transition(rest[rest.length - 1], (container) => { if (container.state === "running") container.state = "exited"; });
      case "rm": {
        for (const id of rest.filter((arg) => !arg.startsWith("--"))) {
          const container = this.byName(id);
          if (container === undefined) return fail(`Error response from daemon: No such container: ${id}`);
          this.containers.delete(container.id);
        }
        return ok("");
      }
      default: return fail(`fake docker does not know "${args.join(" ")}"`);
    }
  }

  private volume(args: readonly string[]): DockerCommandResult {
    const [command, ...rest] = args;
    if (command === "ls") return ok([...this.volumes.values()].filter((volume) => matches(volume.labels, filters(rest))).map((volume) => volume.name).join("\n"));
    if (command === "create") {
      const name = rest[rest.length - 1] ?? "";
      if (this.volumes.has(name)) return ok(name);
      this.volumes.set(name, { name, labels: labels(rest) });
      return ok(name);
    }
    if (command === "rm") {
      for (const name of rest.filter((arg) => !arg.startsWith("--"))) this.volumes.delete(name);
      return ok("");
    }
    return fail(`fake docker does not know "volume ${args.join(" ")}"`);
  }

  private create(args: readonly string[]): DockerCommandResult {
    const name = args[args.indexOf("--name") + 1] ?? "";
    if (this.byName(name) !== undefined) return fail(`Error response from daemon: Conflict. The container name "/${name}" is already in use`);
    const mount = args[args.indexOf("--mount") + 1] ?? "";
    const source = /source=([^,]+)/u.exec(mount)?.[1];
    if (source === undefined || !this.volumes.has(source)) return fail(`Error response from daemon: no volume ${String(source)}`);
    this.ids += 1;
    const id = `c${String(this.ids).padStart(63, "0")}`;
    this.containers.set(id, { id, name, labels: labels(args), state: "created", createArgs: [...args] });
    return ok(id);
  }

  private transition(reference: string | undefined, change: (container: Container) => void): DockerCommandResult {
    const container = this.byName(reference ?? "");
    if (container === undefined) return fail(`Error response from daemon: No such container: ${String(reference)}`);
    change(container);
    return ok(reference ?? "");
  }

  private byName(reference: string): Container | undefined {
    return this.containers.get(reference) ?? [...this.containers.values()].find((container) => container.name === reference);
  }
}

function labels(args: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  args.forEach((arg, index) => {
    if (arg !== "--label") return;
    const [key = "", value = ""] = (args[index + 1] ?? "").split(/=(.*)/su);
    found.set(key, value);
  });
  return found;
}

function filters(args: readonly string[]): Map<string, string> {
  const found = new Map<string, string>();
  args.forEach((arg, index) => {
    if (arg !== "--filter") return;
    const filter = args[index + 1] ?? "";
    if (!filter.startsWith("label=")) throw new Error(`fake docker filters by label only, not ${filter}`);
    const [key = "", value = ""] = filter.slice("label=".length).split(/=(.*)/su);
    found.set(key, value);
  });
  return found;
}

function matches(labelsOf: Map<string, string>, wanted: Map<string, string>): boolean {
  return [...wanted].every(([key, value]) => labelsOf.get(key) === value);
}

function ok(stdout: string): DockerCommandResult {
  return { code: 0, stdout: stdout === "" ? "" : `${stdout}\n`, stderr: "" };
}

function fail(stderr: string): DockerCommandResult {
  return { code: 1, stdout: "", stderr };
}
