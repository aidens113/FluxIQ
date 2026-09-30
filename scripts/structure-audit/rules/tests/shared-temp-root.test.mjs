// Unit tests for the shared-temp-root rule. The rule reaches the repository
// only through ctx, so these build a fake ctx by hand over in-memory fixtures:
// no git, no filesystem.
//
// The rule exists because a test writing under a fixed directory shares it
// with every other run of the same file, and Core's conversation store failed
// exactly that way whenever two lanes validated one checkout. Each flagged form
// is paired with the fix a developer should reach for: mkdtemp.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../shared-temp-root.mjs";

function makeCtx(files) {
  const astCache = new Map();
  return {
    ts,
    CONFIG: { testRootDirNames: ["tests", "e2e"] },
    scriptFiles: Object.keys(files),
    isTestFile: (file) => /\.(test|spec)\.[cm]?[jt]sx?$/.test(file),
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    }
  };
}

const HEADER = 'import os from "node:os";\nimport path from "node:path";\nimport { tmpdir } from "node:os";\nimport { join } from "node:path";\nimport { mkdtemp } from "node:fs/promises";\nimport { mkdtempSync } from "node:fs";\n';
const findingsIn = (body, file = "src/store/tests/store.test.ts") => run(makeCtx({ [file]: HEADER + body }));
const count = (body, file) => findingsIn(body, file).length;

// --- Flagged: a fixed directory every run shares. ---

test("a fixed root under the working directory's .tmp is one failing finding, at its line", () => {
  const findings = findingsIn('\nconst rootDir = path.join(process.cwd(), ".tmp", "store-test");\n');
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, false);
  assert.equal(findings[0].line, 8);
  assert.equal(findings[0].key, "src/store/tests/store.test.ts:8");
  assert.match(findings[0].message, /mkdtemp\(path\.join\(os\.tmpdir\(\), "<name>-"\)\)/);
});

test("every spelling of a fixed temp path is flagged", () => {
  for (const expression of [
    'path.join(os.tmpdir(), "store-test")',
    'path.resolve(os.tmpdir(), "a", "b")',
    'join(tmpdir(), "store-test")',
    'path.posix.join(os.tmpdir(), `store-test`)',
    'path.join(process.cwd(), "tmp", "store-test")',
    'path.join(process.cwd(), ".temp/store-test")',
    'path.resolve(path.join(os.tmpdir(), "fluxiq-domain-root"))'
  ]) {
    assert.equal(count(`const root = ${expression};`), 1, expression);
  }
});

test("test support under a test root is audited even when it is not itself a test file", () => {
  assert.equal(count('export const root = path.join(os.tmpdir(), "fixture-root");', "src/store/tests/fixtures.ts"), 1);
});

// --- Allowed: a fresh directory, a computed name, or no temp directory at all. ---

test("the same path as mkdtemp's prefix is a new directory every run, and is not counted", () => {
  assert.equal(count('const root = await mkdtemp(path.join(os.tmpdir(), "store-test-"));'), 0);
  assert.equal(count('const root = mkdtempSync(join(tmpdir(), "store-test-"));'), 0);
  assert.equal(count('const root = await fs.mkdtemp(path.join(process.cwd(), ".tmp", "store-test-"));'), 0);
});

test("a path with anything computed in it is not a fixed string", () => {
  assert.equal(count("const root = path.join(os.tmpdir(), `store-test-${process.pid}`);"), 0);
  assert.equal(count('const root = path.join(os.tmpdir(), "store-test-" + randomUUID());'), 0);
  assert.equal(count("const root = path.join(os.tmpdir(), name);"), 0);
});

test("fixtures read from the working directory are not temp roots", () => {
  assert.equal(count('const page = path.join(process.cwd(), "fixtures", "page.html");'), 0);
  assert.equal(count('const tmpl = path.join(process.cwd(), "templates", "tmp.json");'), 0);
});

test("source outside tests is not audited: a product's own temp path is its own business", () => {
  assert.equal(count('export const spool = path.join(os.tmpdir(), "fluxiq-spool");', "src/store/spool.ts"), 0);
});

test("the system temp directory alone, or a bare cwd, is not a fixed subdirectory", () => {
  assert.equal(count("const base = os.tmpdir(); const here = process.cwd();"), 0);
  assert.equal(count("const base = path.join(os.tmpdir());"), 0);
});
