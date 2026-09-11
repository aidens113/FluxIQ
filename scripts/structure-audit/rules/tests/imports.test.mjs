// Unit tests for the imports rule's barrel-skipping check, and in particular
// for the exemption that lets a test under <dir>/tests/ import its own
// subject. The rule only reaches the repository through ctx, so these build a
// fake ctx by hand over in-memory fixtures: no git, no filesystem.
//
// The exemption exists because Phase 1 of the module size governance plan
// moves co-located tests down one level. A test that imported "./subject"
// (exempt as a same-directory import) then imports "../subject", which would
// otherwise be counted as reaching past the directory's barrel. The danger of
// such an exemption is that it quietly stops the rule catching real skips, so
// every widening case here is paired with one that must still fail.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../imports.mjs";

const CONFIG = { testRootDirNames: ["tests", "e2e"], forbiddenImports: [], importBoundaries: [] };

// Only the members imports.mjs touches, with the shapes documented in
// scripts/structure-audit/context.mjs.
function makeCtx(files) {
  const read = (file) => files[file];
  const astCache = new Map();
  return {
    CONFIG,
    ts,
    trackedFiles: Object.keys(files),
    scriptFiles: Object.keys(files),
    read,
    parse: (file) => {
      if (!astCache.has(file)) {
        astCache.set(file, ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      }
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

// A feature directory with a barrel, so skipping past it is detectable at all,
// plus a second barrelled directory to import across.
const BASE = {
  "src/feature/index.ts": 'export * from "./subject";',
  "src/feature/subject.ts": "export const subject = 1;",
  "src/other/index.ts": 'export * from "./thing";',
  "src/other/thing.ts": "export const thing = 2;"
};

const skipsFor = (file, source) => {
  const finding = run(makeCtx({ ...BASE, [file]: source })).find((candidate) => candidate.key === file);
  return finding?.value ?? 0;
};

test("a test under tests/ may import its own directory's module directly", () => {
  assert.equal(skipsFor("src/feature/tests/subject.test.ts", 'import { subject } from "../subject";'), 0);
});

test("the exemption applies to every configured test root, not just tests/", () => {
  assert.equal(skipsFor("src/feature/e2e/subject.test.ts", 'import { subject } from "../subject";'), 0);
});

test("a same-directory import stays exempt", () => {
  assert.equal(skipsFor("src/feature/neighbour.ts", 'import { subject } from "./subject";'), 0);
});

// The three cases below are what stop the exemption from hollowing out the
// rule. Each one is a skip the rule must still count.

test("a non-test file reaching into another directory is still counted", () => {
  assert.equal(skipsFor("src/consumer/thing.ts", 'import { subject } from "../feature/subject";'), 1);
});

test("a test reaching past a barrel that is not its own is still counted", () => {
  assert.equal(skipsFor("src/feature/tests/subject.test.ts", 'import { thing } from "../../other/thing";'), 1);
});

test("a test reaching two levels up to a grandparent's file is still counted", () => {
  assert.equal(skipsFor("src/feature/nested/tests/deep.test.ts", 'import { subject } from "../../subject";'), 1);
});

test("a directory named tests does not exempt a non-test sibling directory", () => {
  assert.equal(skipsFor("src/feature/helpers/util.ts", 'import { subject } from "../subject";'), 1);
});
