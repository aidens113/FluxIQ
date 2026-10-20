import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { allocateTaskId, chooseTaskId } from "../task-id.mjs";

const run = promisify(execFile);

// A throwaway repository on `dev`, with one merge subject per id in `merged`
// and one open branch per id in `open`.
async function repository({ merged = [], open = [] } = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-task-id-"));
  const git = (...args) => run("git", ["-C", root, ...args]);
  await git("init", "--initial-branch=dev", "--quiet");
  await git("config", "user.email", "test@example.com");
  await git("config", "user.name", "Test");
  await writeFile(path.join(root, "seed"), "seed");
  await git("add", ".");
  await git("commit", "--quiet", "--no-gpg-sign", "-m", "seed");
  for (const id of merged) await git("commit", "--quiet", "--no-gpg-sign", "--allow-empty", "-m", `Merge task ${id}: something`);
  for (const id of open) await git("branch", `task/${id}-something`);
  return root;
}

const removeAll = (...roots) => Promise.all(roots.map((root) => rm(root, { recursive: true, force: true })));

const open = (number) => ({ number, where: `the open branch task/t${String(number).padStart(3, "0")}-x` });
const merged = (number) => ({ number, where: `the merge already in dev: "Merge task t${String(number).padStart(3, "0")}: x"` });

test("the first task in a repository is t001", () => {
  assert.equal(chooseTaskId({ used: [] }), "t001");
});

test("the next id clears both open branches and merges already in history", () => {
  // A merged task's branch is gone, so scanning branches alone would hand its
  // number out again and put two unrelated units of work under one id.
  assert.equal(chooseTaskId({ used: [open(3), merged(7)] }), "t008");
  assert.equal(chooseTaskId({ used: [merged(7), open(3)] }), "t008");
});

test("ids are three digits, and stay padded until they need a fourth", () => {
  assert.equal(chooseTaskId({ used: [open(41)] }), "t042");
  assert.equal(chooseTaskId({ used: [merged(999)] }), "t1000");
});

test("a requested id is honoured, which is how one task spans both repositories", () => {
  // The whole point of --id: the downstream repository allocated t042 for work
  // that touches both sides, and Core must not allocate a second number for it.
  assert.equal(chooseTaskId({ used: [open(3), merged(7)], requested: "t042" }), "t042");
});

test("a requested id that is already taken is refused, and the refusal names what has it", () => {
  assert.throws(() => chooseTaskId({ used: [open(42)], requested: "t042" }), /taken by the open branch task\/t042-x/u);
  assert.throws(() => chooseTaskId({ used: [merged(42)], requested: "t042" }), /taken by the merge already in dev/u);
});

test("a taken id is recognised however it is padded, because numbers collide and strings do not", () => {
  assert.throws(() => chooseTaskId({ used: [open(42)], requested: "t0042" }), /written differently here and downstream/u);
  assert.throws(() => chooseTaskId({ used: [open(1000)], requested: "t1000" }), /taken by/u);
});

test("an id that is not the shared spelling is refused rather than guessed at", () => {
  for (const requested of ["t42", "42", "t", "task-42", "t04x", "T042", ""]) {
    assert.throws(() => chooseTaskId({ used: [], requested }), /is not a task id/u, `"${requested}" should be refused`);
  }
  assert.throws(() => chooseTaskId({ used: [], requested: "t0042" }), /write it t042/u);
});

test("a repository's next id clears its open branches and its merged history", async (t) => {
  const root = await repository({ merged: ["t003"], open: ["t007"] });
  t.after(() => removeAll(root));

  assert.equal(await allocateTaskId({ repositoryRoot: root }), "t008");
});

test("the first id in an empty repository is t001", async (t) => {
  const root = await repository();
  t.after(() => removeAll(root));

  assert.equal(await allocateTaskId({ repositoryRoot: root }), "t001");
});

// Downstream allocates a Core-paired task against both repositories through
// this function. The defect it guards: the downstream allocator once scanned
// only its own repository, so a paired task could be handed an id Core had
// already spent on different work (t122 on 2026-09-24).
test("a paired allocation clears ids already spent in a paired repository", async (t) => {
  const here = await repository({ merged: ["t121"] });
  const core = await repository({ merged: ["t122", "t123"] });
  t.after(() => removeAll(here, core));

  assert.equal(await allocateTaskId({ repositoryRoot: here }), "t122", "an unpaired allocation stays local");
  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] }), "t124", "a paired allocation clears Core too");
});

test("a paired allocation still clears this repository when the paired one is behind", async (t) => {
  const here = await repository({ merged: ["t050"] });
  const core = await repository({ merged: ["t004"] });
  t.after(() => removeAll(here, core));

  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] }), "t051");
});

test("a paired allocation scans each repository's own integration branch", async (t) => {
  const here = await repository();
  const core = await repository();
  t.after(() => removeAll(here, core));
  await run("git", ["-C", core, "checkout", "--quiet", "-b", "release"]);
  await run("git", ["-C", core, "commit", "--quiet", "--no-gpg-sign", "--allow-empty", "-m", "Merge task t030: on release"]);
  await run("git", ["-C", core, "checkout", "--quiet", "dev"]);

  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] }), "t001", "Core's dev does not hold t030");
  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core, integrationBranch: "release" }] }), "t031");
});

test("an id recorded only in a paired repository is spent, and a request for it names where", async (t) => {
  const here = await repository({ merged: ["t004"] });
  const core = await repository({ merged: ["t004"] });
  t.after(() => removeAll(here, core));
  await run("git", ["-C", core, "update-ref", "refs/fluxiq/task-ids/t020", "HEAD"]);

  assert.equal(await allocateTaskId({ repositoryRoot: here }), "t005", "an unpaired allocation does not read Core");
  assert.equal(await allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }] }), "t021");
  await assert.rejects(
    allocateTaskId({ repositoryRoot: here, pairedRepositories: [{ repositoryRoot: core }], requested: "t020" }),
    (error) => error.message.includes(`recorded as refs/fluxiq/task-ids/t020 in ${core}`)
  );
});

// An abandoned task leaves no branch and no merge, so before ids were recorded
// as refs its number was handed out again (downstream t574, t598, t616).
test("an id recorded as a ref stays spent after its branch is gone", async (t) => {
  const root = await repository({ merged: ["t003"] });
  t.after(() => removeAll(root));
  await run("git", ["-C", root, "update-ref", "refs/fluxiq/task-ids/t009", "HEAD"]);

  assert.equal(await allocateTaskId({ repositoryRoot: root }), "t010");
});
