import assert from "node:assert/strict";
import test from "node:test";

import { parseTaskBranch, taskBranchName } from "../branch-name.mjs";

test("a task branch is its id and its slug", () => {
  assert.equal(taskBranchName("t042", "automation-studio-cleanup"), "task/t042-automation-studio-cleanup");
});

test("a slug that would nest a ref or is not a legal ref component is refused", () => {
  // Each of these would otherwise fail later and further away, inside the
  // checkout that creates the branch, with git's own wording rather than one
  // that says what to type instead.
  for (const slug of ["with/slash", "..", "../escape", "with space", "Upper", "trailing-", "-leading", "double--hyphen", ""]) {
    assert.throws(() => taskBranchName("t001", slug), /not a usable task slug/u, `"${slug}" should be refused`);
  }
});

test("a slug of lower-case words joined by single hyphens is accepted", () => {
  for (const slug of ["a", "recovery", "automation-studio-cleanup", "fix-2-frames"]) {
    assert.equal(taskBranchName("t001", slug), `task/t001-${slug}`);
  }
});

test("a branch reads back as its id and slug, and a non-task branch does not", () => {
  assert.deepEqual(parseTaskBranch("task/t042-automation-studio-cleanup"), { id: "t042", slug: "automation-studio-cleanup" });
  assert.equal(parseTaskBranch("dev"), null);
  assert.equal(parseTaskBranch("main"), null);
  assert.equal(parseTaskBranch("week1-core-production-build"), null);
});

test("a branch name survives the round trip, which is what lets finish find a task by id alone", () => {
  const branch = taskBranchName("t314", "flow-writer");
  assert.deepEqual(parseTaskBranch(branch), { id: "t314", slug: "flow-writer" });
});
