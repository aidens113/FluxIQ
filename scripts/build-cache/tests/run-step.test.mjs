// runStep's decisions on a scratch checkout: what is rebuilt and never
// trusted, when a run goes uncached, and how several steps are scheduled.
// When a result is stamped is in `stamp-rules.test.mjs`.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { runStep, scheduleSteps } from "../index.mjs";
import { makeScratchWorkspace, putFile, runScratch, runsIn, SCRATCH_STEPS } from "./scratch-workspace.mjs";

let repo;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-run-");
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

test("a deleted or edited output is rebuilt, never trusted", async () => {
  await runScratch(repo, "contracts:build", "off");
  await rm(path.join(repo, "packages/contracts/dist/out.txt"));
  const missing = await runScratch(repo, "contracts:build", "off");
  assert.equal(missing.result, "build");
  assert.match(missing.reason, /required output missing: packages\/contracts\/dist\/out\.txt/u);
  await putFile(repo, "packages/contracts/dist/out.txt", "tampered");
  assert.equal((await runScratch(repo, "contracts:build", "off")).reason, "outputs changed since they were stamped");
  assert.equal((await runScratch(repo, "contracts:build", "off")).result, "reuse");
});

test("FLUXIQ_BUILD_FORCE=1 always builds", async () => {
  await runScratch(repo, "contracts:build", "off");
  const forced = await runScratch(repo, "contracts:build", "off", { FLUXIQ_BUILD_FORCE: "1" });
  assert.deepEqual([forced.result, forced.reason], ["build", "FLUXIQ_BUILD_FORCE=1"]);
});

test("a checkout git cannot list runs the command uncached", async () => {
  const plain = await mkdtemp(path.join(os.tmpdir(), "core-cache-nogit-"));
  try {
    await putFile(plain, "pnpm-workspace.yaml", 'packages:\n  - "packages/*"\n');
    await putFile(plain, "packages/contracts/package.json", JSON.stringify({ name: "@fluxiq/contracts" }));
    await putFile(plain, "packages/contracts/run.mjs", "process.exit(0);");
    const steps = { "contracts:build": { package: "packages/contracts", kind: "build", command: "node run.mjs", outputs: [], required: [], env: [] } };
    const outcome = await runStep("contracts:build", { repoRoot: plain, steps, stdio: "ignore", env: { ...process.env, FLUXIQ_BUILD_CACHE_DIR: "off" } });
    assert.deepEqual([outcome.result, outcome.exitCode], ["build", 0]);
    assert.match(outcome.reason, /^not cached: build-cache: git could not list the files of /u);
  } finally {
    await rm(plain, { recursive: true, force: true });
  }
});

test("scheduled in order, the first failure stops the list", async () => {
  await putFile(repo, "packages/fluxiq/fail", "");
  const seen = [];
  const { exitCode, outcomes } = await scheduleSteps(["contracts:build", "fluxiq:build", "web:build"], {
    repoRoot: repo,
    steps: SCRATCH_STEPS,
    stdio: "ignore",
    env: { ...process.env, RUN_LOG: path.join(repo, "runs.log"), FLUXIQ_BUILD_CACHE_DIR: "off", FLUXIQ_BUILD_FORCE: "" },
    onOutcome: (outcome) => seen.push(outcome.step)
  });
  assert.equal(exitCode, 3);
  assert.deepEqual(seen, ["contracts:build", "fluxiq:build"]);
  assert.equal(outcomes.length, 2);
  assert.deepEqual(await runsIn(repo), ["contracts", "fluxiq"]);
});

test("scheduled in parallel, a step starts only after the listed steps of its dependencies", async () => {
  const { exitCode, outcomes } = await scheduleSteps(["web:build", "client-gateway-websocket:build", "fluxiq:build", "contracts:build"], {
    parallel: true,
    repoRoot: repo,
    steps: SCRATCH_STEPS,
    env: { ...process.env, RUN_LOG: path.join(repo, "runs.log"), FLUXIQ_BUILD_CACHE_DIR: "off", FLUXIQ_BUILD_FORCE: "" }
  });
  assert.equal(exitCode, 0);
  const ran = await runsIn(repo);
  assert.equal(ran[0], "contracts");
  assert.ok(ran.indexOf("fluxiq") < ran.indexOf("web"));
  assert.equal(ran.length, 4);
  for (const outcome of outcomes) assert.equal(typeof outcome.output, "string", `${outcome.step}'s output is kept for the caller`);
});
