#!/usr/bin/env node
// The `fluxiq-cloud` command.

import { runCli } from "./run-cli.ts";

process.exitCode = await runCli(process.argv.slice(2), {
  out: (text) => process.stdout.write(text),
  err: (text) => process.stderr.write(text),
  cwd: process.cwd(),
  platform: process.platform
});
