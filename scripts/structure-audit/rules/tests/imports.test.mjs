// Unit tests for the imports rule's barrel-skipping check, and in particular
// for the exemption that lets a module reach the files of a directory it
// lives inside. The rule only reaches the repository through ctx, so these
// build a fake ctx by hand over in-memory fixtures: no git, no filesystem.
//
// The exemption exists because the module size governance plan's relocation
// phases create barrel skips by construction rather than by anyone reaching
// somewhere new. Phase 1 moved co-located tests into <dir>/tests/, turning
// "./subject" into "../subject". Phase 2 applied the prefix rule, turning
// storage/project-foo.ts into storage/project/foo.ts, so that file's import
// of a sibling in storage/ became "../schema-migrations.ts". In both cases
// the importer is still inside the directory it reads from, and no barrel
// stands between them.
//
// The danger of such an exemption is that it quietly stops the rule catching
// real skips, so every widening case here is paired with one that must still
// fail. A crossing into a directory the importer is NOT inside of -- a
// sibling, a cousin, an unrelated feature -- is still counted.

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

// Barrelled directories, so skipping past one is detectable at all. `feature`
// has a nested `components` directory with its own barrel, which is what
// makes the sibling-crossing cases below meaningful.
const BASE = {
  "src/feature/index.ts": 'export * from "./subject";',
  "src/feature/subject.ts": "export const subject = 1;",
  "src/feature/components/index.ts": 'export * from "./widget";',
  "src/feature/components/widget.ts": "export const widget = 2;",
  "src/other/index.ts": 'export * from "./thing";',
  "src/other/thing.ts": "export const thing = 3;"
};

const skipsFor = (file, source) => {
  const finding = run(makeCtx({ ...BASE, [file]: source })).find((candidate) => candidate.key === file);
  return finding?.value ?? 0;
};

// --- Exempt: the importer is inside the directory it reads from. ---

test("a same-directory import stays exempt", () => {
  assert.equal(skipsFor("src/feature/neighbour.ts", 'import { subject } from "./subject";'), 0);
});

test("a test under tests/ may import its own directory's module", () => {
  assert.equal(skipsFor("src/feature/tests/subject.test.ts", 'import { subject } from "../subject";'), 0);
});

test("the exemption is not limited to directories named tests", () => {
  assert.equal(skipsFor("src/feature/e2e/subject.test.ts", 'import { subject } from "../subject";'), 0);
});

test("a prefix-derived subdirectory may import its parent's module", () => {
  assert.equal(skipsFor("src/feature/project/administration.ts", 'import { subject } from "../subject";'), 0);
});

test("the exemption reaches through more than one level of nesting", () => {
  assert.equal(skipsFor("src/feature/project/tests/administration.test.ts", 'import { subject } from "../../subject";'), 0);
});

// --- Still counted: the importer is outside the directory it reads from. ---
// These are what stop the exemption from hollowing out the rule.

test("a non-test file reaching into another directory is still counted", () => {
  assert.equal(skipsFor("src/consumer/thing.ts", 'import { subject } from "../feature/subject";'), 1);
});

test("a test reaching past a barrel that is not its own is still counted", () => {
  assert.equal(skipsFor("src/feature/tests/subject.test.ts", 'import { thing } from "../../other/thing";'), 1);
});

test("reaching into a sibling subdirectory is still counted", () => {
  assert.equal(skipsFor("src/feature/hooks/use-widget.ts", 'import { widget } from "../components/widget";'), 1);
});

test("a parent reaching down into its own child's files is still counted", () => {
  assert.equal(skipsFor("src/feature/host.ts", 'import { widget } from "./components/widget";'), 1);
});

test("a test reaching into a sibling subdirectory is still counted", () => {
  assert.equal(skipsFor("src/feature/tests/host.test.ts", 'import { widget } from "../components/widget";'), 1);
});
