// A reuse leaves output timestamps alone unless an input is newer than every
// output. Downstream guards read Core's dist by modification time: a needless
// touch reads as "Core rebuilt during a run", a missing one as "stale Core".

import assert from "node:assert/strict";
import { readFile, rm, stat, utimes, writeFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { buildAll, makeScratchWorkspace, runScratch } from "./scratch-workspace.mjs";

let repo;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-touch-");
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
});

const at = (relative) => path.join(repo, relative);
const mtime = async (relative) => (await stat(at(relative))).mtimeMs;

async function age(relative, msAgo) {
  const then = new Date(Date.now() - msAgo);
  await utimes(at(relative), then, then);
}

/** Every fluxiq input two hours old and its output one hour old: an ordinary, current build. */
async function settle() {
  for (const file of ["packages/fluxiq/src/main.txt", "packages/fluxiq/package.json", "packages/fluxiq/build.mjs", "packages/fluxiq/check.mjs", "packages/contracts/src/main.txt", "packages/contracts/package.json", "packages/contracts/build.mjs", "packages/contracts/dist/out.txt", "package.json", "pnpm-workspace.yaml"]) {
    await age(file, 2 * 60 * 60 * 1000);
  }
  await age("packages/fluxiq/dist/out.txt", 60 * 60 * 1000);
}

test("a reuse whose inputs are all older than its outputs touches nothing", async () => {
  await buildAll(repo, "off");
  await settle();
  const before = await mtime("packages/fluxiq/dist/out.txt");
  const outcome = await runScratch(repo, "fluxiq:build", "off");
  assert.equal(outcome.result, "reuse");
  assert.equal(outcome.reason, "inputs and outputs match the stamp");
  assert.equal(await mtime("packages/fluxiq/dist/out.txt"), before);
});

test("a reuse whose input is newer than every output touches the required outputs, once", async () => {
  await buildAll(repo, "off");
  await settle();
  // Rewritten with the same bytes, as a revert or a checkout does: the content
  // (and so the fingerprint) is unchanged, the timestamp is new.
  const source = at("packages/fluxiq/src/main.txt");
  await writeFile(source, await readFile(source));
  const started = Date.now();
  const outcome = await runScratch(repo, "fluxiq:build", "off");
  assert.equal(outcome.result, "reuse");
  assert.match(outcome.reason, /^inputs and outputs match the stamp; 1 required output\(s\) touched, because packages\/fluxiq\/src\/main\.txt is newer than every output$/u);
  const touched = await mtime("packages/fluxiq/dist/out.txt");
  assert.ok(touched >= started - 1000, "the required output now carries the current time");
  assert.ok(touched >= (await mtime("packages/fluxiq/src/main.txt")), "no input is newer than the outputs any more");

  const again = await runScratch(repo, "fluxiq:build", "off");
  assert.equal(again.reason, "inputs and outputs match the stamp");
  assert.equal(await mtime("packages/fluxiq/dist/out.txt"), touched, "the second reuse touches nothing");
});

test("a reuse never touches an output that is not required", async () => {
  await buildAll(repo, "off");
  await age("apps/web/.next/server/page.txt", 60 * 60 * 1000);
  const page = await mtime("apps/web/.next/server/page.txt");
  const source = at("apps/web/src/main.txt");
  await writeFile(source, await readFile(source));
  const outcome = await runScratch(repo, "web:build", "off");
  assert.equal(outcome.result, "reuse");
  assert.equal(await mtime("apps/web/.next/server/page.txt"), page);
});
