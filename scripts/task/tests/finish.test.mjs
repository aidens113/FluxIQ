import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { promisify } from "node:util";

import { CONTRACT_TESTS } from "../contract/index.mjs";
import { finishTask } from "../finish.mjs";
import { startTask } from "../start.mjs";

const run = promisify(execFile);
const quiet = () => {};
const passingCheck = async () => {};
const git = async (root, ...args) => (await run("git", ["-C", root, ...args])).stdout.trim();

// A throwaway repository on `dev` with one seed commit and an open task
// carrying one commit of its own.
async function repositoryWithTask() {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-finish-"));
  await git(root, "init", "--initial-branch=dev", "--quiet");
  await git(root, "config", "user.email", "test@example.com");
  await git(root, "config", "user.name", "Test");
  await writeFile(path.join(root, "seed"), "seed");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "seed");
  const task = await startTask({ repositoryRoot: root, slug: "prompt-change", note: quiet });
  await writeFile(path.join(root, "work"), "work");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "work");
  return { root, task };
}

// The contract-test seam: records what it was asked to run and fails the
// files it is told to.
function contractRunner(failing = []) {
  const calls = [];
  const runner = async (packageRoot, files) => {
    calls.push({ packageRoot, files });
    return { failed: files.filter((file) => failing.includes(file)) };
  };
  return { runner, calls };
}

const listed = CONTRACT_TESTS.map((entry) => `${entry.package}/${entry.file}`);

test("the contract list names the three prompt contract tests", () => {
  assert.deepEqual(listed, [
    "packages/fluxiq/src/runtime/llm/deepseek/tests/system-prompt.test.ts",
    "packages/fluxiq/src/runtime/flow-authoring/bootstrap/plan/tests/extraction-vocabulary.test.ts",
    "packages/fluxiq/src/runtime/flow-authoring/bootstrap/plan/tests/issue-feedback.test.ts"
  ]);
});

test("finish runs every contract test in one vitest call per package and merges when they pass", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { runner, calls } = contractRunner();

  const result = await finishTask({ repositoryRoot: root, id: task.id, note: quiet, check: passingCheck, contractTests: runner });

  assert.equal(result.applied, true);
  assert.equal(result.contracts.passed, true);
  assert.deepEqual(result.contracts.files, listed);
  assert.deepEqual(calls, [{ packageRoot: path.join(root, "packages/fluxiq"), files: CONTRACT_TESTS.map((entry) => entry.file) }]);
  assert.match(await git(root, "log", "-1", "--format=%s", "dev"), new RegExp(`^Merge task ${task.id}: `, "u"));
});

test("a failing contract test refuses the merge, naming the file and how to re-pin it", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const devBefore = await git(root, "rev-parse", "dev");
  const failingFile = CONTRACT_TESTS[1].file;
  const { runner } = contractRunner([failingFile]);
  let checked = false;

  await assert.rejects(
    finishTask({ repositoryRoot: root, id: task.id, note: quiet, check: async () => { checked = true; }, contractTests: runner }),
    (error) => {
      assert.match(error.message, new RegExp(`packages/fluxiq/${failingFile.replaceAll(".", "\\.")}`, "u"));
      assert.match(error.message, /re-pin it deliberately/u);
      assert.match(error.message, /pnpm --dir packages\/fluxiq exec vitest run /u);
      assert.doesNotMatch(error.message, /system-prompt\.test\.ts/u, "only the failing file is named");
      return true;
    }
  );

  assert.equal(await git(root, "rev-parse", "dev"), devBefore, "dev is untouched");
  assert.equal(await git(root, "rev-parse", "--abbrev-ref", "HEAD"), "dev", "the main checkout is not left on the task branch");
  assert.equal(checked, false, "pnpm check does not run after a contract failure");
});

test("--skip-checks waives pnpm check but not the contract tests", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const { runner } = contractRunner([CONTRACT_TESTS[0].file]);

  await assert.rejects(finishTask({ repositoryRoot: root, id: task.id, skipChecks: true, note: quiet, contractTests: runner }), /--skip-checks does not waive this gate/u);
});

test("a dry run reports the contract tests it would run and runs nothing", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const devBefore = await git(root, "rev-parse", "dev");
  const { runner, calls } = contractRunner();

  const result = await finishTask({ repositoryRoot: root, id: task.id, dryRun: true, note: quiet, check: passingCheck, contractTests: runner });

  assert.equal(result.applied, false);
  assert.deepEqual(result.contracts, {
    ran: false,
    commands: [`pnpm --dir packages/fluxiq exec vitest run ${CONTRACT_TESTS.map((entry) => entry.file).join(" ")}`],
    files: listed,
    reason: "--dry-run"
  });
  assert.equal(calls.length, 0);
  assert.equal(await git(root, "rev-parse", "dev"), devBefore);
});

// Core's own worktree for the task, as `startTask` with --worktree would leave it.
async function withTaskWorktree(root, task, t) {
  const tree = await mkdtemp(path.join(os.tmpdir(), "core-finish-tree-"));
  t.after(() => rm(tree, { recursive: true, force: true }));
  await git(root, "checkout", "--quiet", "dev");
  await git(root, "worktree", "add", "--quiet", path.join(tree, "wt"), task.branch);
  return path.join(tree, "wt");
}

test("a task branch held by its own worktree is integrated and gated there, and the main checkout stays on dev", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  await git(root, "checkout", "--quiet", "dev");
  await writeFile(path.join(root, "devfile"), "dev moved");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "dev moves");
  const tree = await withTaskWorktree(root, task, t);
  const { runner, calls } = contractRunner();

  const result = await finishTask({ repositoryRoot: root, id: task.id, note: quiet, check: passingCheck, contractTests: runner });

  assert.equal(result.applied, true);
  assert.equal(path.resolve(calls[0].packageRoot), path.resolve(tree, "packages/fluxiq"), "contract tests ran in the task worktree");
  assert.equal(await git(root, "rev-parse", "--abbrev-ref", "HEAD"), "dev");
  assert.match(await git(root, "log", "-1", "--format=%s", "dev"), /^Merge task /u);
  assert.equal(await git(tree, "rev-parse", "--abbrev-ref", "HEAD"), "HEAD", "the task worktree is detached");
  assert.equal(await git(root, "branch", "--list", task.branch), "", "the branch is deleted");
});

test("a contract failure with a task worktree leaves the main checkout untouched on dev", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const tree = await withTaskWorktree(root, task, t);
  const devBefore = await git(root, "rev-parse", "dev");
  const { runner } = contractRunner([CONTRACT_TESTS[0].file]);

  await assert.rejects(finishTask({ repositoryRoot: root, id: task.id, note: quiet, check: passingCheck, contractTests: runner }), /Contract test/u);

  assert.equal(await git(root, "rev-parse", "--abbrev-ref", "HEAD"), "dev");
  assert.equal(await git(root, "rev-parse", "dev"), devBefore);
  assert.equal(await git(tree, "rev-parse", "--abbrev-ref", "HEAD"), task.branch);
});

test("a pushed branch whose upstream lacks the integration merge is still deleted once dev contains it", async (t) => {
  const { root, task } = await repositoryWithTask();
  t.after(() => rm(root, { recursive: true, force: true }));
  const remote = await mkdtemp(path.join(os.tmpdir(), "core-finish-remote-"));
  t.after(() => rm(remote, { recursive: true, force: true }));
  await git(remote, "init", "--bare", "--quiet");
  await git(root, "remote", "add", "origin", remote);
  await git(root, "push", "--quiet", "-u", "origin", task.branch);
  await git(root, "checkout", "--quiet", "dev");
  await writeFile(path.join(root, "devfile"), "dev moved");
  await git(root, "add", ".");
  await git(root, "commit", "--quiet", "--no-gpg-sign", "-m", "dev moves");

  await finishTask({ repositoryRoot: root, id: task.id, note: quiet, check: passingCheck, contractTests: contractRunner().runner });

  assert.equal(await git(root, "branch", "--list", task.branch), "");
});

test("a branch dev does not contain is refused, not force-deleted", async () => {
  const { deleteMergedBranch } = await import("../delete-merged-branch.mjs");
  const { root, task } = await repositoryWithTask();
  try {
    await assert.rejects(deleteMergedBranch({ repositoryRoot: root, branch: task.branch, integrationBranch: "dev" }), /does not contain all of its commits/u);
    await git(root, "checkout", "--quiet", "dev");
    assert.equal(await git(root, "branch", "--list", task.branch), task.branch);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
