import assert from "node:assert/strict";
import test from "node:test";

import { chooseTaskId } from "../task-id.mjs";

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
