// What is and is not an input, on a scratch checkout shaped like Core: the
// runtime data Core writes into ignored package directories never
// invalidates anything, while an untracked file, the web build's ignored
// `.env` files and its NEXT_ and NODE_ENV variables do.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { BUILD_ORDER, buildAll, makeScratchWorkspace, putFile, runScratch } from "./scratch-workspace.mjs";

let repo;
let store;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-graph-");
  store = await mkdtemp(path.join(os.tmpdir(), "core-cache-graph-store-"));
});
afterEach(async () => {
  for (const dir of [repo, store]) await rm(dir, { recursive: true, force: true });
});

const results = (outcomes) => Object.fromEntries(Object.entries(outcomes).map(([step, outcome]) => [step, outcome.result]));
const allReused = Object.fromEntries(BUILD_ORDER.map((step) => [step, "reuse"]));

test("runtime data written into ignored package directories invalidates nothing", async () => {
  await buildAll(repo, "off");
  await putFile(repo, "packages/fluxiq/recordings/run-1/recording.json", "{}");
  await putFile(repo, "packages/fluxiq/storage/fluxiq.db", "rows");
  await putFile(repo, "packages/contracts/storage/cache.bin", "bytes");
  await putFile(repo, "storage/panel.db", "rows");
  await putFile(repo, "packages/fluxiq/node_modules/.cache/other-tool/state.json", "{}");
  assert.deepEqual(results(await buildAll(repo, "off")), allReused);
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).result, "build");
  await putFile(repo, "packages/fluxiq/recordings/run-2/recording.json", "{}");
  assert.equal((await runScratch(repo, "fluxiq:check", "off")).result, "reuse");
});

test("an untracked file that no ignore rule covers is an input", async () => {
  await buildAll(repo, "off");
  await putFile(repo, "packages/fluxiq/src/new-module.txt", "new\n");
  const outcomes = results(await buildAll(repo, "off"));
  assert.deepEqual(outcomes, { "contracts:build": "reuse", "fluxiq:build": "build", "client-gateway-websocket:build": "reuse", "web:build": "build" });
});

test("an ignored input a step names is still an input: the web build's .env files", async () => {
  await buildAll(repo, "off");
  await putFile(repo, "apps/web/.env.local", "NEXT_PUBLIC_FLAG=1\n");
  const outcome = await runScratch(repo, "web:build", "off");
  assert.equal(outcome.result, "build");
  assert.match(outcome.reason, /inputs changed: apps\/web\/\.env\*/u);
  assert.equal((await runScratch(repo, "web:build", "off")).result, "reuse");
});

test("a NEXT_ variable and NODE_ENV change the web build's fingerprint", async () => {
  await buildAll(repo, "off");
  const flagged = await runScratch(repo, "web:build", "off", { NEXT_PUBLIC_FLAG: "on" });
  assert.equal(flagged.result, "build");
  assert.match(flagged.reason, /command, Node version, platform or environment/u);
  assert.equal((await runScratch(repo, "web:build", "off", { NEXT_PUBLIC_FLAG: "on" })).result, "reuse");
  assert.equal((await runScratch(repo, "contracts:build", "off", { NEXT_PUBLIC_FLAG: "on" })).result, "reuse", "only the web build fingerprints NEXT_*");
  assert.equal((await runScratch(repo, "contracts:build", "off", { NODE_ENV: "production" })).result, "build");
});
