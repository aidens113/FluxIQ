// Restoring from the shared store: a result whose outputs name their tree is
// kept for that tree only, a restore copies only the files that differ, a
// damaged entry is discarded and rebuilt, and FLUXIQ_BUILD_FORCE builds.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, readdir, readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { entryDirectory, storeDirectory } from "../index.mjs";
import { buildAll, makeScratchWorkspace, putFile, runScratch, runsIn } from "./scratch-workspace.mjs";

let first;
let second;
let base;
let store;
beforeEach(async () => {
  first = await makeScratchWorkspace("core-store-one-");
  second = await makeScratchWorkspace("core-store-two-");
  base = await mkdtemp(path.join(os.tmpdir(), "core-store-dir-"));
  store = storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: base });
});
afterEach(async () => {
  for (const dir of [first, second, base]) await rm(dir, { recursive: true, force: true });
});

async function entries() {
  const dir = path.join(store, "v1");
  return existsSync(dir) ? readdir(dir) : [];
}

test("an output naming its tree is stored for that tree only: a revert there restores it, another checkout builds", async () => {
  await putFile(first, "apps/web/embed-path", "");
  await putFile(second, "apps/web/embed-path", "");
  const built = await buildAll(first, base);
  assert.match(built["web:build"].reason, /stored in the shared store for this tree only, because apps\/web\/\.next\/server\/page\.txt holds its absolute path \(.+\) and is not relocatable \(\d+ file\(s\), \d+ bytes\)$/u);

  const original = await readFile(path.join(first, "apps/web/src/main.txt"), "utf8");
  await putFile(first, "apps/web/src/main.txt", "edited\n");
  assert.equal((await runScratch(first, "web:build", base)).result, "build");
  await putFile(first, "apps/web/src/main.txt", original);
  const reverted = await runScratch(first, "web:build", base);
  assert.deepEqual([reverted.result, reverted.source], ["reuse", "store"]);
  assert.match(reverted.reason, /^restored from this tree's entry in the shared store \(inputs changed: apps\/web/u);
  assert.deepEqual((await runsIn(first)).filter((name) => name === "web"), ["web", "web"], "the revert did not build");

  const elsewhere = await buildAll(second, base);
  assert.equal(elsewhere["fluxiq:build"].source, "store", "relocatable steps still restore across checkouts");
  assert.deepEqual([elsewhere["web:build"].result, elsewhere["web:build"].source], ["build", "command"]);
  assert.ok((await readFile(path.join(second, "apps/web/.next/server/page.txt"), "utf8")).includes(path.join(second, "apps/web")), "the second checkout's output names the second checkout");
});

test("a restore copies only the files that differ, and leaves the rest untouched", async () => {
  await buildAll(first, base);
  const buildId = path.join(first, "apps/web/.next/BUILD_ID");
  const past = new Date(Date.now() - 60 * 60 * 1000);
  await utimes(buildId, past, past);
  const original = await readFile(path.join(first, "apps/web/src/main.txt"), "utf8");
  await putFile(first, "apps/web/src/main.txt", "edited\n");
  await runScratch(first, "web:build", base);
  await utimes(buildId, past, past);
  await putFile(first, "apps/web/src/main.txt", original);
  const reverted = await runScratch(first, "web:build", base);
  assert.deepEqual([reverted.result, reverted.source], ["reuse", "store"]);
  assert.match(reverted.reason, /^restored from the shared store \(inputs changed: apps\/web; 1 file\(s\) copied\)$/u);
  assert.equal((await stat(buildId)).mtimeMs, past.getTime(), "the unchanged BUILD_ID keeps its timestamp");
  assert.equal(await readFile(path.join(first, "apps/web/.next/server/page.txt"), "utf8"), "@fluxiq/web source\nfluxiq source\n@fluxiq/contracts source\n");
});

test("an entry whose restored outputs do not match the stored digest is discarded and the step builds", async () => {
  await runScratch(first, "contracts:build", base);
  const [key] = await entries();
  await writeFile(path.join(entryDirectory(store, key), "files", "0"), "tampered\n");
  const outcome = await runScratch(second, "contracts:build", base);
  assert.equal(outcome.result, "build");
  assert.match(outcome.reason, /^no stamp; store entry discarded, because the restored outputs digest to [0-9a-f]{12}, not the stored [0-9a-f]{12}; stored in the shared store/u);
  assert.equal(await readFile(path.join(second, "packages/contracts/dist/out.txt"), "utf8"), "@fluxiq/contracts source\n");
});

test("an entry with a missing blob is discarded", async () => {
  await runScratch(first, "contracts:build", base);
  const [key] = await entries();
  await rm(path.join(entryDirectory(store, key), "files", "0"));
  const outcome = await runScratch(second, "contracts:build", base);
  assert.equal(outcome.result, "build");
  assert.match(outcome.reason, /store entry discarded, because blob 0 \(packages\/contracts\/dist\/out\.txt\) is missing/u);
});

test("FLUXIQ_BUILD_FORCE=1 builds instead of restoring", async () => {
  await runScratch(first, "contracts:build", base);
  const forced = await runScratch(second, "contracts:build", base, { FLUXIQ_BUILD_FORCE: "1" });
  assert.equal(forced.result, "build");
  assert.match(forced.reason, /^FLUXIQ_BUILD_FORCE=1; already in the shared store$/u);
});
