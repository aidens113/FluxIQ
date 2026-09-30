// A repository-wide check that replays its output: the structure audit's
// shape. Every git-visible file is its input, a pass is stamped with what it
// printed, a reuse hands that back, and a failure is never stamped.

import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { makeScratchWorkspace, putFile, runScratch, runsIn } from "./scratch-workspace.mjs";

let repo;
let base;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-audit-");
  base = await mkdtemp(path.join(os.tmpdir(), "core-cache-audit-store-"));
});
afterEach(async () => {
  for (const dir of [repo, base]) await rm(dir, { recursive: true, force: true });
});

const PRINTED = /^audit: warning one\n(?:audit: warning two\naudit: passed\n|audit: passed\naudit: warning two\n)$/u;

test("a passing audit is stamped with its output, and a reuse replays it without running", async () => {
  const first = await runScratch(repo, "audit:check", "off");
  assert.deepEqual([first.result, first.exitCode, first.replay], ["build", 0, null]);
  const second = await runScratch(repo, "audit:check", "off");
  assert.deepEqual([second.result, second.source], ["reuse", "stamp"]);
  assert.match(second.replay, PRINTED);
  assert.match(second.fingerprint, /^[0-9a-f]{64}$/u);
  assert.deepEqual(await runsIn(repo), ["audit"]);
});

test("any git-visible file is an input of the audit; an ignored one is not", async () => {
  await runScratch(repo, "audit:check", "off");
  await putFile(repo, "packages/fluxiq/recordings/run/recording.json", "{}");
  assert.equal((await runScratch(repo, "audit:check", "off")).result, "reuse");
  await putFile(repo, "docs/new-page.md", "# New\n");
  const edited = await runScratch(repo, "audit:check", "off");
  assert.equal(edited.result, "build");
  assert.match(edited.reason, /^inputs changed: \./u);
});

test("a failing audit is not stamped and runs again", async () => {
  await putFile(repo, "audit-fails", "");
  assert.equal((await runScratch(repo, "audit:check", "off")).exitCode, 1);
  const again = await runScratch(repo, "audit:check", "off");
  assert.deepEqual([again.result, again.exitCode, again.reason.startsWith("no stamp")], ["build", 1, true]);
  assert.deepEqual(await runsIn(repo), ["audit", "audit"]);
});

test("a pass restored from the shared store replays the output it printed", async () => {
  await runScratch(repo, "audit:check", base);
  const other = await makeScratchWorkspace("core-cache-audit-two-");
  try {
    const restored = await runScratch(other, "audit:check", base);
    assert.deepEqual([restored.result, restored.source], ["reuse", "store"]);
    assert.match(restored.replay, PRINTED);
    assert.deepEqual(await runsIn(other), []);
  } finally {
    await rm(other, { recursive: true, force: true });
  }
});
