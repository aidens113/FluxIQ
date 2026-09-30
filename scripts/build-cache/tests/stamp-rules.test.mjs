// When runStep stamps a result, on a scratch checkout: never after a failed
// build, a check only when it passed, and never when an input changed while
// the step ran.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { decideStep } from "../index.mjs";
import { buildAll, makeScratchWorkspace, putFile, runScratch, SCRATCH_STEPS } from "./scratch-workspace.mjs";

let repo;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-run-");
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

const stampOf = (dir, step) => path.join(repo, dir, "node_modules", ".cache", "fluxiq-core-build", `${step.replace(":", "-")}.json`);

test("a failed build returns its exit code and leaves no stamp", async () => {
  await runScratch(repo, "contracts:build", "off");
  await putFile(repo, "packages/contracts/src/main.txt", "changed\n");
  await putFile(repo, "packages/contracts/fail", "");
  const failed = await runScratch(repo, "contracts:build", "off");
  assert.equal(failed.exitCode, 3);
  assert.equal(existsSync(stampOf("packages/contracts", "contracts:build")), false);
  await rm(path.join(repo, "packages/contracts/fail"));
  assert.equal((await runScratch(repo, "contracts:build", "off")).reason, "no stamp");
});

test("a check is stamped only when it passed", async () => {
  await buildAll(repo, "off");
  await putFile(repo, "packages/fluxiq/check-fails", "");
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).exitCode, 1);
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).result, "build");
  await rm(path.join(repo, "packages/fluxiq/check-fails"));
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).exitCode, 0);
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).result, "reuse");
});

test("an input that changes while the step runs is not stamped", async () => {
  await putFile(repo, "packages/contracts/touch-input", "");
  const outcome = await runScratch(repo, "contracts:build", "off");
  assert.equal(outcome.exitCode, 0);
  assert.match(outcome.reason, /not stamped, because inputs changed while it ran \(packages\/contracts\)/u);
  assert.equal((await decideStep("contracts:build", { repoRoot: repo, steps: SCRATCH_STEPS, env: {} })).decision, "build");
});
