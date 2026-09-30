// A restore into an empty output of many files, as a fresh worktree restores
// fluxiq's thousands of `dist` files: the copies run side by side, and the
// result is still exactly the stored files, verified against the stored
// digest; a damaged entry is still discarded, naming the same blob whatever
// order the copies finished in.

import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { entryDirectory, readEntry, runStep, storeDirectory } from "../index.mjs";
import { makeScratchWorkspace, putFile, SCRATCH_STEPS } from "./scratch-workspace.mjs";

const FILES = 120;
const MANY_SCRIPT = `
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
for (let index = 0; index < ${FILES}; index += 1) {
  const dir = path.join("dist", "group" + (index % 7), "nested" + (index % 3));
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "file" + index + ".js"), "export const value = " + index + ";\\n");
}
writeFileSync(path.join("dist", "out.txt"), "many\\n");
`;
const STEPS = { ...SCRATCH_STEPS, "contracts:build": { ...SCRATCH_STEPS["contracts:build"], command: "node many.mjs" } };

let first;
let second;
let base;
beforeEach(async () => {
  first = await makeScratchWorkspace("core-many-one-");
  second = await makeScratchWorkspace("core-many-two-");
  base = await mkdtemp(path.join(os.tmpdir(), "core-many-store-"));
  for (const repo of [first, second]) await putFile(repo, "packages/contracts/many.mjs", MANY_SCRIPT);
});
afterEach(async () => {
  for (const dir of [first, second, base]) await rm(dir, { recursive: true, force: true });
});

const build = (repo) => runStep("contracts:build", { repoRoot: repo, steps: STEPS, stdio: "ignore", env: { ...process.env, FLUXIQ_BUILD_FORCE: "", FLUXIQ_BUILD_CACHE_DIR: base } });

async function listed(dir, prefix = "") {
  const found = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const relative = prefix === "" ? entry.name : `${prefix}/${entry.name}`;
    if (entry.isDirectory()) found.push(...(await listed(path.join(dir, entry.name), relative)));
    else found.push(relative);
  }
  return found.sort();
}

test("many files restore into an empty output, byte for byte, and every one is counted as copied", async () => {
  assert.equal((await build(first)).result, "build");
  const restored = await build(second);
  assert.deepEqual([restored.result, restored.source], ["reuse", "store"]);
  assert.match(restored.reason, new RegExp(`^restored from the shared store \\(no stamp; ${FILES + 1} file\\(s\\) copied\\)$`, "u"));
  const dist = (repo) => path.join(repo, "packages/contracts/dist");
  const files = await listed(dist(first));
  assert.equal(files.length, FILES + 1);
  assert.deepEqual(await listed(dist(second)), files);
  for (const file of files) assert.equal(await readFile(path.join(dist(second), file), "utf8"), await readFile(path.join(dist(first), file), "utf8"), file);
  assert.equal((await build(second)).source, "stamp", "the restore wrote the local stamp");
});

test("with several blobs missing, the entry is discarded naming the lowest-numbered one, and the step builds", async () => {
  await build(first);
  const store = storeDirectory({ FLUXIQ_BUILD_CACHE_DIR: base });
  const [key] = await readdir(path.join(store, "v1"));
  const entry = await readEntry(entryDirectory(store, key));
  for (const index of [97, 13, 60]) await rm(path.join(entryDirectory(store, key), "files", String(index)));
  const outcome = await build(second);
  assert.equal(outcome.result, "build");
  const lost = entry.files[13];
  assert.ok(outcome.reason.includes(`store entry discarded, because blob 13 (${lost.output}/${lost.relative}) is missing`), outcome.reason);
  assert.equal((await listed(path.join(second, "packages/contracts/dist"))).length, FILES + 1, "the build that followed wrote every file");
});
