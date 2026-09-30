// No workspace package can drop out of the root `pnpm build` or `pnpm check`:
// every package pnpm-workspace.yaml picks up that has a `build` or `check`
// script is registered, runs through the cache CLI and is listed by the root
// script of that kind. Checked on the real repository, and on a scratch
// workspace to show that each way of falling out is reported.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { findUnregisteredScripts, REPOSITORY_ROOT, readWorkspacePackages, STEPS } from "../index.mjs";
import { putFile } from "./scratch-workspace.mjs";

let scratch;
beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "core-unregistered-"));
});
afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const cli = (step, command) => `node ../../scripts/build-cache/cli.mjs ${step} -- "${command}"`;
const manifest = (name, scripts) => JSON.stringify({ name, scripts });

async function workspace(rootScripts, packages) {
  await putFile(scratch, "pnpm-workspace.yaml", 'packages:\n  - "apps/*"\n  - "packages/*"\n');
  await putFile(scratch, "package.json", manifest("root", rootScripts));
  for (const [dir, scripts] of Object.entries(packages)) await putFile(scratch, `${dir}/package.json`, manifest(dir, scripts));
}

const REGISTRY = {
  "alpha:build": { package: "packages/alpha", kind: "build" },
  "alpha:check": { package: "packages/alpha", kind: "check" }
};
const ROOT = { build: "node scripts/build-cache/cli.mjs alpha:build", check: "node --test \"x/*.test.mjs\" && node scripts/build-cache/cli.mjs --parallel alpha:check" };

test("every package build and check script in this repository is registered, cached and listed by the root script", () => {
  assert.deepEqual(findUnregisteredScripts(REPOSITORY_ROOT, STEPS), []);
  const checked = [...readWorkspacePackages(REPOSITORY_ROOT).values()].filter((pkg) => JSON.parse(readFileSync(path.join(pkg.dir, "package.json"), "utf8")).scripts?.check !== undefined);
  assert.ok(checked.length >= 4, `the guard saw only ${checked.length} package(s) with a check script`);
});

test("a workspace whose every package script is registered, cached and listed passes", async () => {
  await workspace(ROOT, { "packages/alpha": { build: cli("alpha:build", "tsc -b"), check: cli("alpha:check", "tsc --noEmit"), test: "vitest run" } });
  assert.deepEqual(findUnregisteredScripts(scratch, REGISTRY), []);
});

test("a new package's check that is not registered, calls tsc directly and is not listed is reported three times", async () => {
  await workspace(ROOT, {
    "packages/alpha": { build: cli("alpha:build", "tsc -b"), check: cli("alpha:check", "tsc --noEmit") },
    "packages/beta": { check: "tsc --noEmit" }
  });
  assert.deepEqual(findUnregisteredScripts(scratch, REGISTRY), [
    "packages/beta has a check script, but beta:check is not registered for it in scripts/build-cache/steps.mjs",
    'packages/beta check does not run beta:check through the build-cache CLI: tsc --noEmit',
    "the root check script does not list beta:check, so pnpm check never runs it"
  ]);
});

test("a registered, cached step the root script leaves out is reported", async () => {
  await workspace({ ...ROOT, check: "node --test \"x/*.test.mjs\"" }, { "packages/alpha": { build: cli("alpha:build", "tsc -b"), check: cli("alpha:check", "tsc --noEmit") } });
  assert.deepEqual(findUnregisteredScripts(scratch, REGISTRY), ["the root check script does not list alpha:check, so pnpm check never runs it"]);
});

test("a script that runs another package's step, or a step registered for another directory, is reported", async () => {
  await workspace(ROOT, { "apps/alpha": { build: cli("alpha:build", "tsc -b") }, "packages/alpha": { check: cli("alpha:build", "tsc --noEmit") } });
  assert.deepEqual(findUnregisteredScripts(scratch, REGISTRY), [
    "apps/alpha has a build script, but alpha:build is not registered for it in scripts/build-cache/steps.mjs",
    "packages/alpha check does not run alpha:check through the build-cache CLI: node ../../scripts/build-cache/cli.mjs alpha:build -- \"tsc --noEmit\""
  ]);
});
