// Runs a step's command the way pnpm runs a package script: through the
// platform shell, in the package directory, with the package's and the
// workspace root's `node_modules/.bin` ahead of PATH, so `tsc` and `next` are
// the pinned ones whichever process called the cache.
//
// `capture` keeps what the command printed:
//   "tee"      printed as it runs and kept (a step that replays its output)
//   "buffer"   kept only, for a caller that prints it when the step is done
//              (steps run side by side, so their output does not interleave)
// Without it the command inherits the caller's output and nothing is kept.

import { spawn } from "node:child_process";
import path from "node:path";

/**
 * @param {string} command
 * @param {{ cwd: string, repoRoot: string, env?: NodeJS.ProcessEnv, stdio?: import("node:child_process").StdioOptions, capture?: "tee" | "buffer" }} options
 * @returns {Promise<{ exitCode: number, output: string | null }>} a signal counts as exit code 1
 */
export function runCommand(command, options) {
  const env = { ...(options.env ?? process.env) };
  const pathKey = Object.keys(env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  for (const name of Object.keys(env)) if (name.toUpperCase() === "PATH" && name !== pathKey) delete env[name];
  const bins = [path.join(options.cwd, "node_modules", ".bin"), path.join(options.repoRoot, "node_modules", ".bin")];
  env[pathKey] = [...bins, env[pathKey] ?? ""].filter((entry) => entry !== "").join(path.delimiter);
  const capture = options.capture;
  const quiet = options.stdio === "ignore";
  const stdio = capture === undefined ? (options.stdio ?? "inherit") : [capture === "tee" && !quiet ? "inherit" : "ignore", "pipe", "pipe"];
  return new Promise((resolve, reject) => {
    const child = spawn(command, { cwd: options.cwd, env, shell: true, stdio });
    const chunks = [];
    if (capture !== undefined) {
      const keep = (stream) => (chunk) => {
        chunks.push(chunk);
        if (capture === "tee" && !quiet) stream.write(chunk);
      };
      child.stdout.on("data", keep(process.stdout));
      child.stderr.on("data", keep(process.stderr));
    }
    child.once("error", reject);
    child.once("close", (code) => resolve({ exitCode: code ?? 1, output: capture === undefined ? null : Buffer.concat(chunks).toString("utf8") }));
  });
}
