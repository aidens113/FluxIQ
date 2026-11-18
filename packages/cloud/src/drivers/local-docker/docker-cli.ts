import type { CommandRequest, CommandResult, CommandRunner } from "../../command/index.ts";
import { CLOUD_PROJECT_LABEL } from "../../plan/index.ts";

/** The resource kinds `down` sweeps by label. */
export type LabelledKind = "container" | "network" | "volume" | "image";

/** Where Compose runs a deployment: its bundle folder, project, env file and Compose files. */
export type ComposeTarget = {
  bundleDir: string;
  project: string;
  composeEnvFile: string;
  composeFiles: readonly string[];
};

/**
 * The `docker` commands the local driver uses, over the injected runner.
 * Every listing that feeds a removal is filtered by the project label, so
 * nothing this class lists for removal can belong to anything else.
 */
export class DockerCli {
  private readonly runner: CommandRunner;

  constructor(runner: CommandRunner) {
    this.runner = runner;
  }

  run(args: readonly string[], options: Omit<CommandRequest, "args"> = {}): Promise<CommandResult> {
    return this.runner.run("docker", { ...options, args });
  }

  /** Runs and answers stdout, or throws naming the step, the exit code and the last lines of its error output. */
  async must(args: readonly string[], step: string, options: Omit<CommandRequest, "args"> = {}): Promise<string> {
    const result = await this.run(args, options);
    if (result.code !== 0) throw new Error(`${step} failed (docker exited ${result.code}).${tail(result.stderr)}`);
    return result.stdout;
  }

  async isRunning(): Promise<boolean> {
    return (await this.run(["version", "--format", "{{.Server.Version}}"])).code === 0;
  }

  async imageExists(reference: string): Promise<boolean> {
    return (await this.run(["image", "inspect", "--format", "{{.Id}}", reference])).code === 0;
  }

  /** The project label's value on a network or volume, "" when it has none, or null when none of that name exists. */
  async labelOf(kind: "network" | "volume", name: string): Promise<string | null> {
    const result = await this.run([kind, "inspect", "--format", `{{index .Labels "${CLOUD_PROJECT_LABEL}"}}`, name]);
    return result.code === 0 ? result.stdout.trim().replace(/^<no value>$/u, "") : null;
  }

  /** Ids (containers), names (networks, volumes) or references (images) of everything carrying the project's label. */
  async labelled(kind: LabelledKind, project: string): Promise<string[]> {
    const filter = ["--filter", `label=${CLOUD_PROJECT_LABEL}=${project}`];
    const args = kind === "container" ? ["ps", "--all", "--quiet", ...filter]
      : kind === "network" ? ["network", "ls", ...filter, "--format", "{{.Name}}"]
      : kind === "volume" ? ["volume", "ls", "--quiet", ...filter]
      : ["image", "ls", ...filter, "--format", "{{.Repository}}:{{.Tag}} {{.ID}}"];
    const stdout = await this.must(args, `Listing this deployment's ${kind}s`);
    const lines = stdout.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
    if (kind !== "image") return [...new Set(lines)];
    return [...new Set(lines.map((line) => {
      const [reference = "", id = ""] = line.split(" ");
      return reference.includes("<none>") ? id : reference;
    }))];
  }

  compose(target: ComposeTarget, args: readonly string[], options: Omit<CommandRequest, "args" | "cwd"> = {}): Promise<CommandResult> {
    const files = target.composeFiles.flatMap((file) => ["--file", file]);
    return this.run(["compose", "--project-name", target.project, "--env-file", target.composeEnvFile, ...files, ...args], { ...options, cwd: target.bundleDir });
  }
}

function tail(stderr: string): string {
  const lines = stderr.trim().split(/\r?\n/u).filter(Boolean).slice(-6);
  return lines.length === 0 ? "" : `\n${lines.map((line) => `  ${line}`).join("\n")}`;
}
