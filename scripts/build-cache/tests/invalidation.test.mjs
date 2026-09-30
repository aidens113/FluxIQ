// Which steps an edit rebuilds, on a scratch checkout shaped like Core, and
// that Next's own cache is never part of the web build's result. What is and
// is not an input is in `ignored-inputs.test.mjs`.

import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { BUILD_ORDER, buildAll, makeScratchWorkspace, putFile, runScratch, runsIn } from "./scratch-workspace.mjs";

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

test("a second build with nothing changed reuses every step and runs nothing", async () => {
  assert.deepEqual(Object.values(results(await buildAll(repo, "off"))), ["build", "build", "build", "build"]);
  assert.deepEqual(results(await buildAll(repo, "off")), allReused);
  assert.deepEqual(await runsIn(repo), ["contracts", "fluxiq", "client-gateway-websocket", "web"]);
});

test("an edit to fluxiq's source rebuilds fluxiq and web only; the revert restores both from the store", async () => {
  await buildAll(repo, store);
  const original = await readFile(path.join(repo, "packages/fluxiq/src/main.txt"), "utf8");
  await putFile(repo, "packages/fluxiq/src/main.txt", "fluxiq source, edited\n");
  const edited = await buildAll(repo, store);
  assert.deepEqual(results(edited), { "contracts:build": "reuse", "fluxiq:build": "build", "client-gateway-websocket:build": "reuse", "web:build": "build" });
  assert.match(edited["fluxiq:build"].reason, /^inputs changed: packages\/fluxiq;/u);
  assert.match(edited["web:build"].reason, /^inputs changed: packages\/fluxiq, packages\/fluxiq\/dist;/u);
  assert.match(await readFile(path.join(repo, "apps/web/.next/server/page.txt"), "utf8"), /fluxiq source, edited/u);

  await putFile(repo, "packages/fluxiq/src/main.txt", original);
  const reverted = await buildAll(repo, store);
  assert.deepEqual(results(reverted), allReused);
  assert.deepEqual(
    BUILD_ORDER.map((step) => reverted[step].source),
    ["stamp", "store", "stamp", "store"]
  );
  assert.equal(await readFile(path.join(repo, "apps/web/.next/server/page.txt"), "utf8"), "@fluxiq/web source\nfluxiq source\n@fluxiq/contracts source\n");
  assert.deepEqual((await runsIn(repo)).slice(4), ["fluxiq", "web"], "the revert ran nothing");
});

test("Next's own .next/cache is neither an output digest nor restored", async () => {
  await buildAll(repo, store);
  await putFile(repo, "apps/web/.next/cache/compiled.txt", "rewritten by next dev");
  assert.equal((await runScratch(repo, "web:build", store)).result, "reuse");
});
