#!/usr/bin/env node
// node scripts/build-cache/prove-inputs.mjs [--json] [step ...]
//
// The coverage proof for Core's steps: every file a step's compiler loads is
// one its fingerprint hashes, or installed. How it asks the tools and what it
// prints is described in `entry/prove-inputs.mjs`.

import { proveInputs } from "./entry/index.mjs";
import { CORE_REPOSITORY } from "./repository/index.mjs";

process.exit(await proveInputs(process.argv.slice(2), { repository: CORE_REPOSITORY }));
