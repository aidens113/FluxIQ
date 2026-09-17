import assert from "node:assert/strict";
import test from "node:test";

import { parseTaskArguments } from "../arguments.mjs";

test("a command and its slug are read", () => {
  const parsed = parseTaskArguments(["start", "automation-studio-cleanup"]);
  assert.equal(parsed.command, "start");
  assert.deepEqual(parsed.positional, ["automation-studio-cleanup"]);
  assert.deepEqual(parsed.flags, {});
});

test("--dry-run is accepted by every command", () => {
  for (const command of ["start", "finish", "abandon", "list"]) {
    assert.equal(parseTaskArguments([command, "x", "--dry-run"]).flags["dry-run"], true);
  }
});

test("an unknown flag is refused rather than ignored", () => {
  // A dropped --dry-run is the difference between a report and a branch, so a
  // typo has to stop the command rather than change what it does.
  assert.throws(() => parseTaskArguments(["start", "x", "--dry-runn"]), /--dry-runn is not a flag of "start"/u);
  assert.throws(() => parseTaskArguments(["finish", "t042", "--worktree"]), /--worktree is not a flag of "finish"/u);
});

test("a flag aimed at the wrong command is refused, and the refusal names the right one", () => {
  assert.throws(() => parseTaskArguments(["start", "x", "--skip-checks"]), /it belongs to finish/u);
  assert.throws(() => parseTaskArguments(["start", "x", "--force"]), /it belongs to abandon/u);
  assert.throws(() => parseTaskArguments(["finish", "t042", "--force"]), /it belongs to abandon/u);
});

test("--id and --from take their values, and refuse to swallow the next flag", () => {
  const parsed = parseTaskArguments(["start", "x", "--id", "t042", "--from", "main", "--dry-run"]);
  assert.equal(parsed.values.id, "t042");
  assert.equal(parsed.values.from, "main");
  assert.equal(parsed.flags["dry-run"], true);

  assert.throws(() => parseTaskArguments(["start", "x", "--id", "--dry-run"]), /--id needs a value/u);
  assert.throws(() => parseTaskArguments(["start", "x", "--id"]), /--id needs a value/u);
});

test("--id belongs to start alone, because an id is chosen when the task opens", () => {
  assert.throws(() => parseTaskArguments(["finish", "t042", "--id", "t043"]), /it belongs to start/u);
});

test("finish keeps everything after the id, which becomes the merge subject", () => {
  const parsed = parseTaskArguments(["finish", "t042", "Teach", "the", "writer", "to", "retry", "--skip-checks"]);
  assert.deepEqual(parsed.positional, ["t042", "Teach", "the", "writer", "to", "retry"]);
  assert.equal(parsed.flags["skip-checks"], true);
});

test("no command, and an unknown command, are both refused", () => {
  assert.throws(() => parseTaskArguments([]), /Name a command: start, finish, abandon, list/u);
  assert.throws(() => parseTaskArguments(["prune"]), /Unknown command "prune"/u);
});
