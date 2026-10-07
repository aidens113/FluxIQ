// Unit tests for the as-never rule. The rule reaches the repository only
// through ctx, so these build a fake ctx by hand over in-memory fixtures: no
// git, no filesystem.
//
// The rule exists because `never` is assignable to every type: a stub cast
// `as never` keeps compiling after the contract it stands in for changes, and
// in October 2026 seven Core re-author tests stayed broken for a day behind
// exactly such stubs. The ratchet cases run the real applyRatchet, so they
// show what `node scripts/structure-audit.mjs` itself would decide.

import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { run, id } from "../as-never.mjs";
import { applyRatchet } from "../../baseline.mjs";

function makeCtx(files) {
  const astCache = new Map();
  const kind = (file) => (/\.[cm]?js$/.test(file) ? ts.ScriptKind.JS : file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  return {
    ts,
    scriptFiles: Object.keys(files),
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) {
        astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, kind(file)));
      }
      return astCache.get(file);
    }
  };
}

const count = (source, file = "src/port.ts") => run(makeCtx({ [file]: source })).reduce((total, finding) => total + finding.value, 0);
const audit = (files, baselineEntries) =>
  applyRatchet(run(makeCtx(files)).map((finding) => ({ ...finding, rule: id })), { rules: baselineEntries ? { [id]: baselineEntries } : {} });

// --- Flagged ---

test("one `as never` cast is one ratcheted fail finding keyed by file, at its line", () => {
  const findings = run(makeCtx({ "src/tests/port.test.ts": "const port = {\n  approve: () => undefined\n} as never;\n" }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].key, "src/tests/port.test.ts");
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].limit, 0);
  assert.equal(findings[0].line, 3);
});

test("the message says why the cast is dangerous and what to write instead", () => {
  const [finding] = run(makeCtx({ "src/port.ts": "export const p = stub as never;" }));
  assert.match(finding.message, /assignable to every type/);
  assert.match(finding.message, /typed stub/);
  assert.match(finding.message, /satisfies/);
  assert.match(finding.message, /helper that returns the real type/);
});

test("both spellings and every position count, each cast once", () => {
  assert.equal(count("const a = value as never;"), 1);
  assert.equal(count("const a = <never>value;"), 1);
  assert.equal(count("const a = value as unknown as never;"), 1);
  assert.equal(count("call(a as never, b as never);"), 2);
  assert.equal(count("const port = { approve: (() => ok) as never, reject: x as never };"), 2);
  assert.equal(count("export function f() { return (stub as never); }"), 1);
});

test("tests and source alike are audited; a .tsx and a .mjs file too", () => {
  assert.equal(count("const a = b as never;", "src/feature/tests/feature.test.ts"), 1);
  assert.equal(count("export const C = () => <Panel port={stub as never} />;", "src/panel.tsx"), 1);
  assert.equal(count("const a = b as never;", "scripts/tool.mjs"), 1);
});

// --- Not flagged ---

test("the words in a comment, a string or a template literal do not count", () => {
  assert.equal(count("// stubs cast as never hide type changes\nconst a = 1;"), 0);
  assert.equal(count("/* value as never */ const a = 1;"), 0);
  assert.equal(count("const message = \"do not write value as never\";"), 0);
  assert.equal(count("const message = `cast ${name} as never`;"), 0);
});

test("a checked use of `never` is not a cast: annotations, return types, exhaustiveness", () => {
  assert.equal(count("function fail(message: string): never { throw new Error(message); }"), 0);
  assert.equal(count("function exhaustive(value: never): never { throw new Error(String(value)); }"), 0);
  assert.equal(count("type Empty = Record<string, never>; const e: Empty = {};"), 0);
  assert.equal(count("const a = value as unknown; const b = value as Port; const c = { a } satisfies Shape;"), 0);
});

test("a file with no cast produces no finding", () => {
  assert.deepEqual(run(makeCtx({ "src/clean.ts": "export const port: Port = { approve: async () => ok };" })), []);
});

// --- The ratchet ---

test("fail-first: a new `as never` in an unbaselined file fails the audit", () => {
  const result = audit({ "src/new.ts": "const a = b as never;" }, { "src/old.ts": 2 });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].key, "src/new.ts");
});

test("fail-first: one more cast in a baselined file fails, and says the entry may only shrink", () => {
  const result = audit({ "src/old.ts": "f(a as never, b as never, c as never);" }, { "src/old.ts": 2 });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /Baseline for this entry is 2/);
});

test("baselined casts pass, and fewer than recorded can be lowered", () => {
  const atBaseline = audit({ "src/old.ts": "f(a as never, b as never);" }, { "src/old.ts": 2 });
  assert.equal(atBaseline.failures.length, 0);
  assert.equal(atBaseline.suppressed.length, 1);
  const below = audit({ "src/old.ts": "f(a as never);" }, { "src/old.ts": 2 });
  assert.equal(below.failures.length, 0);
  assert.equal(below.lowerable.length, 1);
});
