import { spawn } from "node:child_process";
import type { CommandRequest, CommandResult, CommandRunner } from "./types.ts";

/**
 * The real runner: spawns the program directly (no shell, so no argument is
 * ever reinterpreted), collects its output, and with `echo` streams it to
 * `progress` as it comes. A program that is not installed answers 127.
 */
export function nodeCommandRunner(progress: (text: string) => void): CommandRunner {
  return {
    run(command: string, request: CommandRequest): Promise<CommandResult> {
      return new Promise((resolve) => {
        const child = spawn(command, [...request.args], {
          cwd: request.cwd,
          ...(request.env === undefined ? {} : { env: { ...process.env, ...request.env } }),
          stdio: [request.input === undefined ? "ignore" : "pipe", "pipe", "pipe"],
          windowsHide: true
        });
        let stdout = "";
        let stderr = "";
        child.stdout?.on("data", (chunk: Buffer) => {
          stdout += chunk.toString("utf8");
          if (request.echo) progress(chunk.toString("utf8"));
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr += chunk.toString("utf8");
          if (request.echo) progress(chunk.toString("utf8"));
        });
        child.on("error", (error: NodeJS.ErrnoException) => resolve({ code: 127, stdout, stderr: `${command} could not be started (${error.code ?? error.message}). Is it installed and on PATH?` }));
        child.on("close", (code) => resolve({ code: code ?? 1, stdout, stderr }));
        if (request.input !== undefined) child.stdin?.end(request.input);
      });
    }
  };
}
