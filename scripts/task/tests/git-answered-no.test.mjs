import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { gitAnsweredNo } from "../git-answered-no.mjs";
import { runGit } from "../git-command.mjs";

test("git that ran and exited non-zero is an answer", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "core-git-answer-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  await runGit(root, ["init", "--quiet"]);

  const refusal = await runGit(root, ["rev-parse", "--verify", "--quiet", "no-such-revision^{commit}"]).then(() => null, (error) => error);

  assert.ok(refusal, "a missing revision rejects");
  assert.equal(gitAnsweredNo(refusal), true);
});

// A machine without git on its PATH must not read as "on no branch, behind
// nothing": a check that cannot run must not report a clean result.
test("git that could not run, or was killed, is not an answer", () => {
  assert.equal(gitAnsweredNo(new Error("spawn git ENOENT", { cause: Object.assign(new Error("spawn git ENOENT"), { code: "ENOENT" }) })), false);
  assert.equal(gitAnsweredNo(new Error("killed", { cause: Object.assign(new Error("killed"), { code: null, signal: "SIGTERM" }) })), false);
  assert.equal(gitAnsweredNo(new Error("no cause")), false);
  assert.equal(gitAnsweredNo(undefined), false);
});
