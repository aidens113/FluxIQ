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
function makeCtx(files, config = CONFIG) {
  const read = (file) => files[file];
  const astCache = new Map();
  return {
    CONFIG: config,
    ts,
    files: Object.keys(files),
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

// --- Import boundaries: a directory edge that must not be crossed. ---
// `valueOnly` exists for a boundary configured against a module cycle. A cycle
// is a run-time fault, a type is erased before run time, and the harness still
// has to read the other side's contracts -- so the ban has to distinguish the
// two. The pairs below are what stop that distinction from becoming a hole:
// every exempted form is matched by one that must still fail.

const BOUNDARY_CONFIG = (valueOnly) => ({
  testRootDirNames: ["tests", "e2e"],
  forbiddenImports: [],
  importBoundaries: [{ from: "src/feature", to: "src/other", valueOnly, reason: "Reason." }]
});

const crossings = (source, valueOnly) =>
  run(makeCtx({ ...BASE, "src/feature/crosser.ts": source }, BOUNDARY_CONFIG(valueOnly)))
    .filter((finding) => finding.message.includes("resolves under")).length;

test("a value import across a boundary fails", () => {
  assert.equal(crossings('import { thing } from "../other/index.ts";', true), 1);
});

test("an import type across a value-only boundary is allowed", () => {
  assert.equal(crossings('import type { Thing } from "../other/index.ts";', true), 0);
});

test("an export type across a value-only boundary is allowed", () => {
  assert.equal(crossings('export type { Thing } from "../other/index.ts";', true), 0);
});

// Under verbatimModuleSyntax this emits `import {} from "../other/index.ts"`,
// which is a real edge in the emitted graph and can close a cycle.
test("an inline type specifier is not treated as a type-only import", () => {
  assert.equal(crossings('import { type Thing } from "../other/index.ts";', true), 1);
});

test("a bare side-effect import across a value-only boundary fails", () => {
  assert.equal(crossings('import "../other/index.ts";', true), 1);
});

test("a dynamic import across a value-only boundary fails", () => {
  assert.equal(crossings('export const load = () => import("../other/index.ts");', true), 1);
});

test("a boundary without valueOnly still bans type-only imports", () => {
  assert.equal(crossings('import type { Thing } from "../other/index.ts";', undefined), 1);
});

test("a boundary does not touch an importer outside its from directory", () => {
  const ctx = makeCtx({ ...BASE, "src/consumer/crosser.ts": 'import { thing } from "../other/index.ts";' }, BOUNDARY_CONFIG(true));
  assert.equal(run(ctx).filter((finding) => finding.message.includes("resolves under")).length, 0);
});
