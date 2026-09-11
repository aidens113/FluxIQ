// Unit tests for the naming rule's depth check and its prefix-group check,
// and for the interaction between them. The rule reaches the repository only
// through ctx, so these build a fake ctx by hand: no git, no filesystem.
//
// Two behaviours here were added during the module size governance migration
// and both are easy to get wrong in opposite directions, so each widening is
// paired with a case that must still fail:
//
//   - Test SUPPORT modules beside their tests are exempt from depth, not just
//     test files. A shared fixture forced out of the tests/ folder that owns
//     it is worse placement bought for a smaller number, and depth does not
//     ratchet, so it cannot be baselined where it belongs.
//   - The prefix rule must never demand a directory that the depth rule would
//     then reject. Without that guard the two deadlock: flat, the prefix rule
//     says to create <dir>/<prefix>/; nested, depth rejects it.

import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../naming.mjs";

const LIMITS = { maxPathSegments: 9, prefixGroup: 3 };
const CONFIG = {
  testRootDirNames: ["tests", "e2e"],
  bannedBasenames: ["utils", "helpers"],
  bannedDirectoryNames: ["misc", "common"],
  depthExemptPrefixes: []
};

function makeCtx(files) {
  return {
    LIMITS,
    CONFIG,
    sourceFiles: files,
    trackedFiles: files,
    isTestFile: (f) => /\.(test|spec)\.[a-z]+$/.test(f),
    basename: (f) => f.split("/").at(-1),
    dirname: (f) => f.split("/").slice(0, -1).join("/"),
    extname: (f) => { const b = f.split("/").at(-1); const i = b.lastIndexOf("."); return i <= 0 ? "" : b.slice(i); }
  };
}

const depthFor = (file, extra = []) =>
  run(makeCtx([file, ...extra])).filter((f) => f.key === file && /depth limit/.test(f.message)).length;

const DEEP = "a/b/c/d/e/f/g/h/i/too-deep.ts";          // 10 segments
const DEEP_TEST = "a/b/c/d/e/f/g/h/tests/thing.test.ts"; // 10 segments, a test
const DEEP_FIXTURE = "a/b/c/d/e/f/g/h/tests/fixture.ts"; // 10 segments, support

test("a production module past the depth limit is reported", () => {
  assert.equal(depthFor(DEEP), 1);
});

test("a test file past the depth limit is exempt", () => {
  assert.equal(depthFor(DEEP_TEST), 0);
});

test("a support module inside a tests/ folder is exempt", () => {
  assert.equal(depthFor(DEEP_FIXTURE), 0);
});

test("a support module inside an e2e/ folder is exempt", () => {
  assert.equal(depthFor("a/b/c/d/e/f/g/h/e2e/fixture.ts"), 0);
});

test("a module merely NAMED like a test root is not exempt", () => {
  assert.equal(depthFor("a/b/c/d/e/f/g/h/i/tests.ts"), 1);
});

test("a module in a sibling of a tests/ folder is not exempt", () => {
  assert.equal(depthFor("a/b/c/d/e/f/g/h/fixtures/thing.ts"), 1);
});

// The prefix/depth deadlock guard.

const prefixGroupFor = (dir, stems) => {
  const files = stems.map((s) => `${dir}/${s}.ts`);
  return run(makeCtx(files)).filter((f) => /share the prefix/.test(f.message)).length;
};

test("a prefix group of three is reported at shallow depth", () => {
  assert.equal(prefixGroupFor("a/b/c", ["project-one", "project-two", "project-three"]), 1);
});

test("a prefix group is NOT reported when the new directory would breach depth", () => {
  // a/b/c/d/e/f/g/h is 8 segments; the demanded a/b/c/d/e/f/g/h/project/x.ts
  // would be 10, which depth rejects and cannot ratchet.
  assert.equal(prefixGroupFor("a/b/c/d/e/f/g/h", ["project-one", "project-two", "project-three"]), 0);
});
