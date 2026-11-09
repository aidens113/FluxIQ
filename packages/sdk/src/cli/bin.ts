#!/usr/bin/env node
// The `fluxiq` command.

import { runCli } from "./run-cli.ts";

process.exitCode = await runCli(process.argv.slice(2), { out: (text) => process.stdout.write(text), err: (text) => process.stderr.write(text), env: process.env, cwd: process.cwd() });
