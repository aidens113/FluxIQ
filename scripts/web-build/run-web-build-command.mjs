// The default way a keyed web build runs a command: a child process that
// inherits this process's output, succeeding on exit 0. A caller that
// supervises its children, bounds them or keeps their output in a log passes
// its own `run` to `prepareWebBuild` instead.

import { spawn } from "node:child_process";

/**
 * @param {{ name: string, command: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, shell: boolean }} command
 * @returns {Promise<void>}
 */
export function runWebBuildCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command.command, command.args, { cwd: command.cwd, env: command.env, shell: command.shell, stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command.name} exited unsuccessfully (${signal ?? `exit ${code}`})`));
    });
  });
}
