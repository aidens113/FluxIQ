import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, readdir, rm, utimes, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { afterEach, beforeEach, test } from "node:test";
import { acquireStepLock, acquireStepReadLock } from "../index.mjs";
import { makeScratchWorkspace, runsIn, runScratch } from "./scratch-workspace.mjs";

let scratch;
let lockPath;
beforeEach(async () => {
  scratch = await mkdtemp(path.join(os.tmpdir(), "core-cache-read-lock-"));
  lockPath = path.join(scratch, "step.lock");
});
afterEach(async () => {
  await rm(scratch, { recursive: true, force: true });
});

const FAST = { pollMs: 20 };

/** A pid that was running a moment ago and is not any more. */
function deadPid() {
  const child = spawnSync(process.execPath, ["-e", "console.log(process.pid)"], { encoding: "utf8" });
  return Number(child.stdout.trim());
}

/** Tracks when a pending acquisition settles, without awaiting it. */
function track(promise) {
  const state = { settled: false, value: undefined };
  state.done = promise.then((value) => {
    state.settled = true;
    state.value = value;
    return value;
  });
  return state;
}

const readerEntries = async () => (await readdir(scratch)).filter((name) => name.startsWith("step.lock.reader-"));

test("two readers hold one step at once, each with its own entry", async () => {
  const one = await acquireStepReadLock(lockPath, FAST);
  const two = await acquireStepReadLock(lockPath, FAST);
  assert.equal(one.waitedMs, 0);
  assert.equal(two.waitedMs, 0);
  assert.notEqual(one.path, two.path);
  assert.equal((await readerEntries()).length, 2);
  assert.equal(existsSync(lockPath), false, "readers never create the writer's lock");
  await one.release();
  await two.release();
  assert.deepEqual(await readdir(scratch), [], "no entry or temporary file is left behind");
});

test("a writer waits for every reader to leave, then holds the step", async () => {
  const one = await acquireStepReadLock(lockPath, FAST);
  const two = await acquireStepReadLock(lockPath, FAST);
  const writer = track(acquireStepLock(lockPath, FAST));
  await delay(150);
  assert.equal(writer.settled, false, "a writer never holds the step beside a reader");
  await one.release();
  await delay(150);
  assert.equal(writer.settled, false, "one reader still holds it");
  await two.release();
  const held = await writer.done;
  assert.ok(held.waitedMs > 0);
  assert.equal(held.heldBy, process.pid);
  assert.equal(held.heldAs, "read");
  await held.release();
  assert.deepEqual(await readdir(scratch), []);
});

test("a reader waits while a writer holds the step", async () => {
  const writer = await acquireStepLock(lockPath, FAST);
  const reader = track(acquireStepReadLock(lockPath, FAST));
  await delay(150);
  assert.equal(reader.settled, false);
  assert.deepEqual(await readerEntries(), [], "a waiting reader records no entry");
  await writer.release();
  const held = await reader.done;
  assert.ok(held.waitedMs > 0);
  assert.equal(held.heldBy, process.pid);
  await held.release();
});

test("a new reader queues behind a writer that is waiting for earlier readers", async () => {
  const first = await acquireStepReadLock(lockPath, FAST);
  const writer = track(acquireStepLock(lockPath, FAST));
  // The writer has created its lock file and is waiting on the first reader.
  while (!existsSync(lockPath)) await delay(10);
  const late = track(acquireStepReadLock(lockPath, FAST));
  await delay(150);
  assert.equal(writer.settled, false);
  assert.equal(late.settled, false, "the late reader does not slip in ahead of the waiting build");
  await first.release();
  const held = await writer.done;
  await delay(100);
  assert.equal(late.settled, false, "the late reader still waits while the build holds the step");
  await held.release();
  await (await late.done).release();
});

test("a writer waiting on readers keeps its own lock young, so a second writer never judges it stale", async () => {
  const reader = await acquireStepReadLock(lockPath, { ...FAST, staleMs: 150, heartbeatMs: 20 });
  const first = track(acquireStepLock(lockPath, { ...FAST, staleMs: 150 }));
  while (!existsSync(lockPath)) await delay(10);
  const second = track(acquireStepLock(lockPath, { ...FAST, staleMs: 150 }));
  await delay(500);
  assert.equal(first.settled, false);
  assert.equal(second.settled, false);
  await reader.release();
  const held = await first.done;
  assert.equal(held.heldAs, "read", "the first writer kept its place and only ever waited on the reader");
  await delay(100);
  assert.equal(second.settled, false, "the second writer waits for the first");
  await held.release();
  await (await second.done).release();
});

test("a dead reader's entry is removed and the writer runs", async () => {
  await mkdir(scratch, { recursive: true });
  const stale = `${lockPath}.reader-${randomUUID()}`;
  await writeFile(stale, JSON.stringify({ pid: deadPid(), token: "dead" }));
  const writer = await acquireStepLock(lockPath, FAST);
  assert.equal(existsSync(stale), false);
  assert.equal(writer.waitedMs, 0);
  await writer.release();
});

test("a reader entry untouched past the stale bound is removed even when its pid is running", async () => {
  const stale = `${lockPath}.reader-${randomUUID()}`;
  await writeFile(stale, JSON.stringify({ pid: process.ppid, token: "old" }));
  const old = new Date(Date.now() - 31 * 60 * 1000);
  await utimes(stale, old, old);
  const writer = await acquireStepLock(lockPath, FAST);
  assert.equal(existsSync(stale), false);
  await writer.release();
});

test("a live reader's heartbeat keeps a writer with a short stale bound waiting", async () => {
  const reader = await acquireStepReadLock(lockPath, { ...FAST, staleMs: 100, heartbeatMs: 20 });
  const writer = track(acquireStepLock(lockPath, { ...FAST, staleMs: 100 }));
  await delay(400);
  assert.equal(writer.settled, false, "a heartbeated reader is never broken");
  assert.equal(existsSync(reader.path), true);
  reader.assertHeld();
  await reader.release();
  await (await writer.done).release();
});

test("a stale writer lock is broken by a reader", async () => {
  await writeFile(lockPath, JSON.stringify({ pid: deadPid(), token: "dead" }));
  const reader = await acquireStepReadLock(lockPath, FAST);
  assert.equal(existsSync(lockPath), false);
  await reader.release();
});

test("a removed entry is reported lost, and neither release deletes another owner's file", async () => {
  let lost = null;
  const reader = await acquireStepReadLock(lockPath, { ...FAST, heartbeatMs: 20, onLost: (error) => { lost = error; } });
  await writeFile(reader.path, JSON.stringify({ pid: process.pid, token: "replacement" }));
  while (lost === null) await delay(10);
  assert.throws(() => reader.assertHeld(), /read lock lost/u);
  reader.releaseSync();
  await reader.release();
  assert.equal(existsSync(reader.path), true, "the replacement is left alone");
});

test("synchronous release removes the reader's own entry", async () => {
  const reader = await acquireStepReadLock(lockPath, FAST);
  reader.releaseSync();
  assert.deepEqual(await readerEntries(), []);
});

test("a heartbeat at or past the stale bound is refused", async () => {
  await assert.rejects(acquireStepReadLock(lockPath, { staleMs: 100, heartbeatMs: 100 }), /heartbeat/u);
  assert.deepEqual(await readdir(scratch), []);
});

test("a build of a step waits for its read lock, then decides again", async () => {
  const repo = await makeScratchWorkspace("core-cache-read-lock-run-");
  try {
    const stepLock = path.join(repo, "packages", "contracts", "node_modules", ".cache", "fluxiq-core-build", "contracts-build.json.lock");
    const reader = await acquireStepReadLock(stepLock, FAST);
    const build = track(runScratch(repo, "contracts:build", "off"));
    await delay(400);
    assert.equal(build.settled, false);
    assert.deepEqual(await runsIn(repo), [], "nothing was built under the reader");
    await reader.release();
    const outcome = await build.done;
    assert.equal(outcome.result, "build");
    assert.match(outcome.reason, new RegExp(`^waited \\d+\\.\\ds for pid ${process.pid}'s read lock on this step, then `, "u"));
    assert.deepEqual(await runsIn(repo), ["contracts"]);
  } finally {
    await rm(repo, { recursive: true, force: true });
  }
});
