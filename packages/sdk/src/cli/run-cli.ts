// The command line: picks the command, runs it, and turns an error into a message and
// an exit code. It never prints a key.

import { SdkError } from "../errors/index.ts";
import type { CliIo } from "./cli-io.ts";
import { devCommand } from "./dev-command.ts";
import { HELP_TEXT } from "./help-text.ts";
import { initCommand } from "./init-command.ts";
import { inspectCommand } from "./inspect-command.ts";
import { learnCommand } from "./learn-command.ts";
import { pinCommand } from "./pin-command.ts";
import { runsCommand } from "./runs-command.ts";

/** Runs `fluxiq <argv>` and returns the exit code. */
export async function runCli(argv: string[], io: CliIo): Promise<number> {
  const [command, ...args] = argv;
  try {
    switch (command) {
      case "init":
        return initCommand(io);
      case "dev":
        return await devCommand(args, io);
      case "runs":
        return await runsCommand(args, io);
      case "inspect":
        return await inspectCommand(args, io);
      case "pin":
        return await pinCommand(args, io);
      case "learn":
        return await learnCommand(args, io);
      case undefined:
      case "help":
      case "--help":
      case "-h":
        io.out(HELP_TEXT);
        return 0;
      default:
        io.err(`Unknown command "${command}".\n\n${HELP_TEXT}`);
        return 2;
    }
  } catch (error) {
    if (error instanceof SdkError) {
      io.err(`fluxiq: ${error.message}\n${error.hint === undefined ? "" : `  ${error.hint}\n`}`);
      return error.code === "cli" ? 2 : 1;
    }
    throw error;
  }
}
