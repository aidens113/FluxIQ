#!/usr/bin/env node
// The `pnpm task` entry point. A task is one unit of work -- one brief -- on
// its own branch, so that it can be validated before it reaches `dev`, merged
// with a boundary that can be reverted whole, and thrown away without leaving
// anything behind if it goes wrong.
//
//   pnpm task start <slug> [--id t<NNN>] [--from BRANCH]
//   pnpm task finish <id> [title words...] [--skip-checks]
//   pnpm task abandon <id> [--force]
//   pnpm task list
//
// Every command takes --dry-run, which decides all refusals and reports what it
// would do without changing anything.
//
// `--id` is how a task that spans Core and the downstream web-extension
// repository stays one unit of work: the id is allocated there and passed here,
// so both histories name it the same. Core opens a branch and nothing more --
// a Core-paired task's Core WORKTREE is created by the downstream tooling,
// because it is that repository's `domain/package.json` link that decides where
// a Core worktree has to sit.
//
// The repository is the checkout this file lives in, so running it inside a
// Core worktree operates on that worktree, not on F:/!FluxIQ.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { runTaskCommandLine } from "./index.mjs";

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

try {
  const result = await runTaskCommandLine({ argv: process.argv.slice(2), repositoryRoot });
  process.stdout.write(`${JSON.stringify(result)}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  if (error?.cause instanceof Error) process.stderr.write(`${error.cause.message}\n`);
  process.exitCode = 1;
}
