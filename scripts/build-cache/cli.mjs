#!/usr/bin/env node
// node scripts/build-cache/cli.mjs <step> [-- "<command>"]
// node scripts/build-cache/cli.mjs [--parallel] <step> <step>...
//
// Core's steps through the cache. The arguments, the one JSON line printed per
// step and the exit code are described in `entry/run-cli.mjs`, which a
// downstream repository's own `cli.mjs` runs with its own repository.

import { runCli } from "./entry/index.mjs";
import { CORE_REPOSITORY } from "./repository/index.mjs";

process.exit(await runCli(process.argv.slice(2), { repository: CORE_REPOSITORY }));
