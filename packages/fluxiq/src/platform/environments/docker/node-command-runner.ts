import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import type { DockerCommandResult, DockerCommandRunner, DockerLineAnswer } from "./types.ts";

/**
 * The real runner: spawns `docker` directly (no shell, so no argument is
 * reinterpreted) with its own configuration folder, which a read-only
 * server can always write. `converse` answers each line the program prints
 * on its standard input and closes that input once the program exits.
 */
export function nodeDockerCommandRunner(options: { binary?: string; configDir?: string } = {}): DockerCommandRunner {
  const binary = options.binary ?? "docker";
  const env = { ...process.env, DOCKER_CONFIG: options.configDir ?? "/tmp/fluxiq-docker-config", DOCKER_CLI_HINTS: "false" };
  const launch = (args: readonly string[], answer: DockerLineAnswer | null): Promise<DockerCommandResult> => new Promise((resolve, reject) => {
    const child = spawn(binary, [...args], { env, stdio: [answer === null ? "ignore" : "pipe", "pipe", "pipe"], windowsHide: true });
    let stdout = "";
    let stderr = "";
    let failed: unknown = null;
    const output = child.stdout;
    const errors = child.stderr;
    if (output === null || errors === null) throw new Error("docker was started without its output pipes.");
    errors.setEncoding("utf8").on("data", (chunk: string) => { stderr += chunk; });
    if (answer === null) {
      output.setEncoding("utf8").on("data", (chunk: string) => { stdout += chunk; });
    } else {
      createInterface({ input: output }).on("line", (line) => {
        stdout += `${line}\n`;
        if (failed !== null) return;
        try {
          const reply = answer(line);
          if (reply !== undefined) child.stdin?.write(`${reply}\n`);
        } catch (error) {
          failed = error;
          child.kill();
        }
      });
    }
    child.on("error", (error: NodeJS.ErrnoException) => resolve({ code: 127, stdout, stderr: `${binary} could not be started (${error.code ?? error.message}).` }));
    child.on("close", (code) => {
      child.stdin?.destroy();
      if (failed !== null) reject(failed);
      else resolve({ code: code ?? 1, stdout, stderr });
    });
  });
  return {
    run: (args) => launch(args, null),
    converse: (args, answer) => launch(args, answer)
  };
}
