// Unit tests for the one-file test group check of the test-placement rule. The rule reaches the repository
// only through ctx, so these build a fake ctx by hand over a list of paths.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import { run } from "../test-placement.mjs";

function makeCtx(files) {
  return {
    CONFIG: { testRootDirNames: ["tests", "e2e"] },
    sourceFiles: files,
    isTestFile: (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

test("a group directory holding one test file is a failing, ratcheted finding", () => {
  const findings = run(makeCtx(["src/a/tests/loop/tests/loop.test.ts", "src/a/tests/other.test.ts"]));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].key, "src/a/tests/loop/tests");
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.match(findings[0].message, /share a filename prefix/);
});

test("a group of two files passes", () => {
  assert.equal(run(makeCtx(["src/a/tests/loop/tests/one.test.ts", "src/a/tests/loop/tests/two.test.ts"])).length, 0);
});

test("a group with a test and a support file is not a one-file group", () => {
  assert.equal(run(makeCtx(["src/a/tests/loop/tests/one.test.ts", "src/a/tests/loop/tests/world.ts"])).length, 0);
});

test("a plain tests directory with one file is not a group", () => {
  assert.equal(run(makeCtx(["src/a/tests/one.test.ts"])).length, 0);
});

test("a group of subgroups counts files beneath it", () => {
  const files = ["src/a/tests/g/tests/x/tests/a.test.ts", "src/a/tests/g/tests/x/tests/b.test.ts"];
  assert.equal(run(makeCtx(files)).length, 0);
});

test("a test file beside its source still fails, and the two checks share one rule id", () => {
  const findings = run(makeCtx(["src/a/one.test.ts", "src/a/tests/loop/tests/loop.test.ts"]));
  assert.deepEqual(findings.map((f) => f.key).sort(), ["src/a", "src/a/tests/loop/tests"]);
  assert.ok(findings.every((f) => f.rule === "test-placement"));
});
