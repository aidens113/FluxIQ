// Unit tests for the statement-packing rule. The rule reaches the repository
// only through ctx, so these build a fake ctx by hand over in-memory fixtures:
// no git, no filesystem.
//
// The rule exists because on 2026-10-09 a worker twice kept a file inside its
// file-lines budget by packing several statements onto one line. The ratchet
// cases run the real applyRatchet, so they show what
// `node scripts/structure-audit.mjs` itself would decide.

import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { run, id } from "../statement-packing.mjs";
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

const count = (source, file = "src/module.ts") => run(makeCtx({ [file]: source })).reduce((total, finding) => total + finding.value, 0);
const audit = (files, baselineEntries) =>
  applyRatchet(run(makeCtx(files)).map((finding) => ({ ...finding, rule: id })), { rules: baselineEntries ? { [id]: baselineEntries } : {} });

// --- Reported ---

test("the two shapes that dodged the budget are each one ratcheted fail finding, at their line", () => {
  const declarationAndIf = "export function f(cond: boolean) {\n  let a: number | undefined; if (cond) doThing({ a }); // comment\n  return a;\n}\n";
  const findings = run(makeCtx({ "src/runtime/service.ts": declarationAndIf }));
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].key, "src/runtime/service.ts");
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].limit, 0);
  assert.equal(findings[0].line, 2);
  assert.equal(count("import { a } from \"./a.js\"; import { b } from \"./b.js\";\n"), 1);
});

test("the message says what to do and why the packing is refused", () => {
  const [finding] = run(makeCtx({ "src/module.ts": "a(); b();\n" }));
  assert.match(finding.message, /line 1/);
  assert.match(finding.message, /own line/);
  assert.match(finding.message, /file-lines budget/);
  assert.match(finding.message, /split the file/);
});

test("every kind of statement counts when it follows another on the same line", () => {
  assert.equal(count("const a = 1; const b = 2;"), 1);
  assert.equal(count("a(); b();"), 1);
  assert.equal(count("const a = 1; if (a) b();"), 1);
  assert.equal(count("function f() { a(); return 1; }"), 1);
  assert.equal(count("async function f() { await a(); await b(); }"), 1);
  assert.equal(count("export const a = 1; export function f() {}"), 1);
  assert.equal(count("function f() { log(); throw new Error(\"x\"); }"), 1);
  assert.equal(count("type A = string; interface B { a: A }"), 1);
  assert.equal(count("if (a) {} b();"), 1);
  assert.equal(count("switch (k) {\n  case 1: a(); break;\n  default: b(); return;\n}"), 2);
  assert.equal(count("namespace N { const a = 1; export const b = a; }"), 1);
});

test("a multi-statement one-line body counts; so does a statement after a multi-line one", () => {
  assert.equal(count("const f = () => { a(); b(); };"), 1);
  assert.equal(count("items.forEach((item) => { seen.add(item); count += 1; });"), 1);
  assert.equal(count("call({\n  a: 1\n}); next();\n"), 1);
});

test("a line is counted once however many statements it holds; each packed line counts", () => {
  assert.equal(count("a(); b(); c(); d();"), 1);
  assert.equal(count("a(); b();\nc();\nd(); e();\n"), 2);
  const [finding] = run(makeCtx({ "src/module.ts": "a(); b();\nc();\nd(); e();\n" }));
  assert.match(finding.message, /lines 1, 3/);
});

test(".tsx, .mjs and .js files are audited too", () => {
  assert.equal(count("export const C = () => { const a = 1; return <div>{a}</div>; };", "src/panel.tsx"), 1);
  assert.equal(count("const a = 1; const b = 2;", "scripts/tool.mjs"), 1);
  assert.equal(count("const a = 1; const b = 2;", "scripts/tool.js"), 1);
});

// --- Ignored ---

test("a for header's semicolons are not statements", () => {
  assert.equal(count("for (let i = 0; i < n; i += 1) total += i;"), 0);
  assert.equal(count("for (;;) { if (done()) break; }"), 0);
});

test("semicolons in strings, template literals, regular expressions and comments do not count", () => {
  assert.equal(count("const s = \"a(); b();\";"), 0);
  assert.equal(count("const s = 'a; b';"), 0);
  assert.equal(count("const t = `a(); ${b}; c();`;"), 0);
  assert.equal(count("const r = /a;b;c/g;"), 0);
  assert.equal(count("run(); // then a(); b();"), 0);
  assert.equal(count("/* a(); b(); */ run();"), 0);
});

test("type-literal and interface members are not statements", () => {
  assert.equal(count("type A = { a: string; b: number };"), 0);
  assert.equal(count("interface B { a: string; b(): void; c?: number }"), 0);
  assert.equal(count("function f(o: { a: string; b: number }): { c: boolean; d: string } { return g(o); }"), 0);
});

test("a one-line arrow or function body holding a single statement is fine", () => {
  assert.equal(count("const f = () => { run(); };"), 0);
  assert.equal(count("function f() { return 1; }"), 0);
  assert.equal(count("const g = (x: number) => x + 1;"), 0);
  assert.equal(count("items.map((item) => { return item.id; });"), 0);
  assert.equal(count("if (a) { b(); } else { c(); }"), 0);
  assert.equal(count("if (a) return; else b();"), 0);
  assert.equal(count("try { a(); } catch { b(); } finally { c(); }"), 0);
  assert.equal(count("case1: switch (k) { case 1: case 2: return a; default: return b; }"), 0);
});

test("one statement per line, and a stray empty statement, produce no finding", () => {
  assert.deepEqual(run(makeCtx({ "src/clean.ts": "const a = 1;\nconst b = 2;\nif (a) {\n  b();\n}\n" })), []);
  assert.equal(count("class A {};"), 0);
  assert.equal(count("run();;"), 0);
});

// --- The ratchet ---

test("fail-first: a packed line in an unbaselined file fails the audit", () => {
  const result = audit({ "src/new.ts": "a(); b();" }, { "src/old.ts": 2 });
  assert.equal(result.failures.length, 1);
  assert.equal(result.failures[0].key, "src/new.ts");
});

test("fail-first: one more packed line in a baselined file fails, and says the entry may only shrink", () => {
  const result = audit({ "src/old.ts": "a(); b();\nc(); d();\ne(); f();\n" }, { "src/old.ts": 2 });
  assert.equal(result.failures.length, 1);
  assert.match(result.failures[0].message, /Baseline for this entry is 2/);
});

test("baselined packed lines pass, and fewer than recorded can be lowered", () => {
  const atBaseline = audit({ "src/old.ts": "a(); b();\nc(); d();\n" }, { "src/old.ts": 2 });
  assert.equal(atBaseline.failures.length, 0);
  assert.equal(atBaseline.suppressed.length, 1);
  const below = audit({ "src/old.ts": "a(); b();\nc();\nd();\n" }, { "src/old.ts": 2 });
  assert.equal(below.failures.length, 0);
  assert.equal(below.lowerable.length, 1);
});
