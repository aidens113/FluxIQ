import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { abandonTask } from "../abandon.mjs";
import { recordTaskId } from "../record-task-id.mjs";
import { startTask } from "../start.mjs";
import { allocateTaskId } from "../task-id.mjs";

const run = promisify(execFile);
const quiet = () => {};

// A throwaway repository on `dev` with one seed commit.
async function repository() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-record-id-"));
  const git = (...args) => run("git", ["-C", root, ...args]);
  await git("init", "--initial-branch=dev", "--quiet");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await writeFile(path.join(root, "seed"), "seed");
  await git("add", ".");
  await git("commit", "--quiet", "--no-gpg-sign", "-m", "seed");
  return root;
}

const git = async (root, ...args) => (await run("git", ["-C", root, ...args])).stdout.trim();

test("starting a task records its id as a ref at the commit it started from", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  const started = await startTask({ repositoryRoot: root, slug: "first", note: quiet });

  assert.equal(started.id, "t001");
  assert.equal(await git(root, "rev-parse", "refs/fluxiq/task-ids/t001"), await git(root, "rev-parse", "dev"));
});

test("a dry run records nothing", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  await startTask({ repositoryRoot: root, slug: "first", dryRun: true, note: quiet });

  assert.equal(await git(root, "for-each-ref", "refs/fluxiq/task-ids/"), "");
});

// Downstream, t616 was abandoned at 19:10 on 2026-10-14 and its number handed
// to the next start seconds later. Core's allocator had the same gap.
test("start, abandon, start again: the second task gets a new id", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await startTask({ repositoryRoot: root, slug: "first", note: quiet });
  const abandoned = await abandonTask({ repositoryRoot: root, id: first.id, note: quiet });
  assert.equal(abandoned.applied, true);
  const second = await startTask({ repositoryRoot: root, slug: "second", note: quiet });

  assert.equal(first.id, "t001");
  assert.equal(second.id, "t002");
  assert.match(await git(root, "for-each-ref", "--format=%(refname)", "refs/fluxiq/task-ids/"), /refs\/fluxiq\/task-ids\/t001/u, "abandon leaves the ref in place");
});

test("an abandoned id cannot be requested again with --id", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  const first = await startTask({ repositoryRoot: root, slug: "first", note: quiet });
  await abandonTask({ repositoryRoot: root, id: first.id, note: quiet });

  await assert.rejects(startTask({ repositoryRoot: root, slug: "again", id: "t001", note: quiet }), /taken by the earlier allocation recorded as refs\/fluxiq\/task-ids\/t001/u);
});

// The downstream repository records a Core-paired task's id here, at Core's
// `dev`, without running this start; Core's own allocator must honour it.
test("an id recorded here by a downstream paired start is spent", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  await recordTaskId(root, "t040", "dev");

  assert.equal(await allocateTaskId({ repositoryRoot: root }), "t041");
});

test("a Task trailer on any local branch spends its id", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, "checkout", "--quiet", "-b", "side-work");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "--allow-empty", "-m", "fix: something\n\nTask: t012\nWorker: test");
  await git(root, "checkout", "--quiet", "dev");

  assert.equal(await allocateTaskId({ repositoryRoot: root }), "t013");
  await assert.rejects(allocateTaskId({ repositoryRoot: root, requested: "t012" }), /a "Task: t012" trailer on a local branch/u);
});

test("recording an id twice is refused, so two racing starts cannot share one", async (t) => {
  const root = await repository();
  t.after(() => rm(root, { recursive: true, force: true }));

  await recordTaskId(root, "t005", "dev");
  await assert.rejects(recordTaskId(root, "t005", "dev"), /claimed .* by another start at the same moment/u);
});

// A downstream paired start allocates against both repositories and records
// the id on both sides (through these same modules), and a paired abandon
// deletes both branches. Neither deletion may free the number.
test("a paired id recorded on both sides stays spent after both branches are deleted", async (t) => {
  const here = await repository();
  const core = await repository();
  t.after(() => Promise.all([rm(here, { recursive: true, force: true }), rm(core, { recursive: true, force: true })]));
  const paired = { repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] };

  const id = await allocateTaskId(paired);
  await recordTaskId(here, id, "dev");
  await recordTaskId(core, id, "dev");
  for (const root of [here, core]) {
    await git(root, "branch", `task/${id}-paired`, "dev");
    await git(root, "branch", "-D", `task/${id}-paired`);
  }

  assert.equal(id, "t001");
  assert.equal(await allocateTaskId(paired), "t002");
  assert.equal(await git(core, "rev-parse", `refs/fluxiq/task-ids/${id}`), await git(core, "rev-parse", "dev"));
});

test("a ref recorded only in the paired repository still blocks a paired allocation", async (t) => {
  const here = await repository();
  const core = await repository();
  t.after(() => Promise.all([rm(here, { recursive: true, force: true }), rm(core, { recursive: true, force: true })]));

  await recordTaskId(core, "t007", "dev");

  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] }), "t008");
});
