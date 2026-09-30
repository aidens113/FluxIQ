import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, test } from "node:test";
import { acquireStepLock } from "../index.mjs";
import { makeScratchWorkspace, runsIn, runScratch } from "./scratch-workspace.mjs";

let repo;
let scratch;
beforeEach(async () => {
  repo = await makeScratchWorkspace("core-cache-lock-");
  scratch = await mkdtemp(path.join(os.tmpdir(), "core-cache-lock-file-"));
});
afterEach(async () => {
  await rm(repo, { recursive: true, force: true });
  await rm(scratch, { recursive: true, force: true });
});

const lockOf = (dir) => path.join(repo, "packages", dir, "node_modules", ".cache", "fluxiq-core-build", `${dir}-build.json.lock`);

/** A pid that was running a moment ago and is not any more. */
function deadPid() {
  const child = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
  return Number(child.stdout.trim());
}

test("a second run of the same step waits for the first, then reuses what it stamped", async () => {
  const [one, two] = await Promise.all([
    runScratch(repo, "contracts:build", "off", { SLOW_BUILD: "600" }),
    runScratch(repo, "contracts:build", "off", { SLOW_BUILD: "600" })
  ]);
  assert.deepEqual(await runsIn(repo), ["contracts"], "the command ran once");
  const [builder, waiter] = one.result === "build" ? [one, two] : [two, one];
  assert.equal(builder.result, "build");
  assert.equal(waiter.result, "reuse");
  assert.match(waiter.reason, new RegExp(`^waited \\d+\\.\\ds for pid ${process.pid}'s run of this step, then inputs and outputs match the stamp$`, "u"));
  assert.equal(existsSync(lockOf("contracts")), false, "the lock is released");
});

test("different steps do not wait for each other", async () => {
  const outcomes = await Promise.all([runScratch(repo, "contracts:build", "off"), runScratch(repo, "fluxiq:check", "off")]);
  for (const outcome of outcomes) assert.doesNotMatch(outcome.reason, /waited/u);
});

test("a lock whose owner is dead is broken at once", async () => {
  await mkdir(path.dirname(lockOf("contracts")), { recursive: true });
  await writeFile(lockOf("contracts"), JSON.stringify({ pid: deadPid(), token: "dead" }));
  const outcome = await runScratch(repo, "contracts:build", "off");
  assert.equal(outcome.result, "build");
  assert.equal(outcome.reason, "no stamp");
  assert.equal(existsSync(lockOf("contracts")), false);
});

test("a lock older than 30 minutes is broken even when its pid is running", async () => {
  await mkdir(path.dirname(lockOf("contracts")), { recursive: true });
  await writeFile(lockOf("contracts"), JSON.stringify({ pid: process.ppid, token: "old" }));
  const old = new Date(Date.now() - 31 * 60 * 1000);
  await utimes(lockOf("contracts"), old, old);
  const outcome = await runScratch(repo, "contracts:build", "off");
  assert.equal(outcome.reason, "no stamp");
});

test("a live, recent lock is waited on until it is released", async () => {
  const lockPath = path.join(scratch, "step.lock");
  const held = await acquireStepLock(lockPath);
  let acquired = false;
  const waiting = acquireStepLock(lockPath, { pollMs: 20 }).then((lock) => {
    acquired = true;
    return lock;
  });
  await new Promise((resolve) => setTimeout(resolve, 150));
  assert.equal(acquired, false);
  await held.release();
  const second = await waiting;
  assert.ok(second.waitedMs > 0);
  assert.equal(second.heldBy, process.pid);
  await second.release();
  assert.deepEqual(await readdir(scratch), [], "no lock or temporary file is left behind");
});

test("releasing a lock somebody else now holds leaves it alone", async () => {
  const lockPath = path.join(scratch, "step.lock");
  const mine = await acquireStepLock(lockPath);
  await rm(lockPath);
  const theirs = await acquireStepLock(lockPath);
  await mine.release();
  assert.equal(existsSync(lockPath), true);
  await theirs.release();
  assert.equal(existsSync(lockPath), false);
});
