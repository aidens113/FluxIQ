// The shared store: it is namespaced, fingerprints do not name the checkout,
// a relocatable result built in one checkout is restored in another, path
// spellings are found, and the store is pruned. Rooted entries, differential
// restore and damaged entries are in `store-restore.test.mjs`.

import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, readFile, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { pathToFileURL } from "node:url";
import { decideStep, findEmbeddedPath, pathSpellings, pruneStore, storeDirectory } from "../index.mjs";
import { BUILD_ORDER, buildAll, makeScratchWorkspace, runsIn, SCRATCH_STEPS } from "./scratch-workspace.mjs";

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

test("the store lives under a core namespace, defaulting to LOCALAPPDATA, and can be moved or switched off", () => {
  assert.equal(store, path.join(base, "core"));
  assert.equal(storeDirectory({ LOCALAPPDATA: path.join(base, "local") }), path.join(base, "local", "fluxiq-build-cache", "core"));
  assert.equal(storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: "off" }), null);
  assert.equal(storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: " OFF " }), null);
});

test("the same inputs in two checkouts at different paths have one fingerprint, and no label names either path", async () => {
  for (const step of Object.keys(SCRATCH_STEPS)) {
    const one = await decideStep(step, { repoRoot: first, steps: SCRATCH_STEPS, env: {} });
    const two = await decideStep(step, { repoRoot: second, steps: SCRATCH_STEPS, env: {} });
    assert.equal(one.fingerprint, two.fingerprint, step);
    const fingerprinted = JSON.stringify({ meta: one.resolved.meta, roots: one.resolved.roots.map((root) => root.label) }).toLowerCase();
    for (const spelling of pathSpellings([first])) assert.ok(!fingerprinted.includes(spelling), `${step} fingerprints ${spelling}`);
  }
});

test("a result built in one checkout is restored in another, byte for byte, then reused from the local stamp", async () => {
  await buildAll(first, base);
  assert.equal((await entries()).length, 4);
  const restored = await buildAll(second, base);
  for (const step of BUILD_ORDER) {
    assert.deepEqual([restored[step].result, restored[step].source], ["reuse", "store"], step);
    assert.match(restored[step].reason, /^restored from the shared store \(no stamp; [12] file\(s\) copied\)$/u, step);
  }
  const again = await buildAll(second, base);
  for (const step of BUILD_ORDER) assert.equal(again[step].source, "stamp", step);
  assert.deepEqual(await runsIn(second), [], "nothing ran in the second checkout");
  for (const file of ["packages/fluxiq/dist/out.txt", "apps/web/.next/server/page.txt", "apps/web/.next/BUILD_ID"]) {
    assert.equal(await readFile(path.join(second, file), "utf8"), await readFile(path.join(first, file), "utf8"), file);
  }
  assert.equal(existsSync(path.join(second, "apps/web/.next/cache/compiled.txt")), false, "Next's own cache is never restored");
});

test("every common spelling of the tree's path is found", async () => {
  const root = path.resolve(first);
  const forward = root.split(path.sep).join("/");
  const written = {
    native: root,
    forward,
    backslash: forward.split("/").join("\\"),
    "JSON-escaped": JSON.stringify(root).slice(1, -1),
    "file URL": pathToFileURL(root).href,
    "upper-cased": root.toUpperCase()
  };
  const spellings = pathSpellings([root]);
  for (const [how, text] of Object.entries(written)) {
    const file = path.join(base, `${how}.txt`);
    await writeFile(file, `prefix ${text}/packages/fluxiq/dist/out.txt suffix`);
    assert.notEqual(await findEmbeddedPath([file], spellings), null, `${how}: ${text}`);
  }
  const clean = path.join(base, "clean.txt");
  await writeFile(clean, "../../packages/fluxiq/src/main.txt and C:/somewhere/else");
  assert.equal(await findEmbeddedPath([clean], spellings), null);
});

test("pruning removes entries unused for 14 days, then the least recently used above the cap", async () => {
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const make = async (name, ageDays, bytes) => {
    const dir = path.join(store, "v1", name.padEnd(64, "0"));
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, "entry.json"), JSON.stringify({ bytes }));
    const used = new Date(now - ageDays * day);
    await utimes(path.join(dir, "entry.json"), used, used);
  };
  await make("a", 15, 10);
  await make("b", 3, 60);
  await make("c", 2, 60);
  await make("d", 1, 60);
  await mkdir(path.join(store, "v1", "e".padEnd(64, "0")), { recursive: true });
  const pruned = await pruneStore(store, { now, maxBytes: 130 });
  assert.deepEqual({ kept: pruned.kept, removed: pruned.removed, bytes: pruned.bytes }, { kept: 2, removed: 3, bytes: 120 });
  assert.deepEqual((await entries()).map((name) => name[0]).sort(), ["c", "d"]);
});
