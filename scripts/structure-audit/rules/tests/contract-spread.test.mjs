// Unit tests for the contract-spread rule. The rule reaches the repository only
// through ctx, so these build a fake ctx by hand over in-memory fixtures: no
// git, no filesystem, and a config the test supplies.
//
// The rule exists because of a defect that shipped three times in the FluxIQ
// web-extension repository. A page-evidence producer wrote an optional contract
// field as `...(label ? { label } : {})`, someone renamed the field, and the
// value silently stopped arriving on the wire -- because TypeScript's
// excess-property check runs on the properties a literal writes out and not on
// the properties a spread brings in. Each row below was checked against `tsc`
// before it was written here, so the pairs record real compiler behaviour:
//
//   const a: C = { ...whole, titel: v };                 TS2353  -- caught
//   const b: C = { selector: v, ...(c ? { titel: v } : {}) };    -- silent
//   const c: C = { selector: v, ...boundsOrNone() };             -- silent
//   const d: C = { ...whole, selektor: v };              TS2561  -- caught
//
// So the line the rule draws is between a spread of a *fresh* value, whose
// properties nothing has checked, and a spread of a *named* value, which is
// copy-with-override and stays safe. Every "is flagged" case below is paired
// with the named-value form that must not be.

import test from "node:test";
import assert from "node:assert/strict";
import path from "node:path";
import ts from "typescript";
import { run } from "../contract-spread.mjs";

const PATHS = [
  { path: "src/evidence", reason: "these modules build page evidence", remedy: "Use present<T>()." },
  { path: "src/merge/snapshot.ts", reason: "this file merges page evidence" }
];

function makeCtx(files, contractSpreadPaths = PATHS) {
  const astCache = new Map();
  const keys = Object.keys(files);
  return {
    ts,
    CONFIG: { contractSpreadPaths },
    scriptFiles: keys,
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) {
        astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      }
      return astCache.get(file);
    },
    dirname: (file) => path.posix.dirname(file),
    basename: (file) => path.posix.basename(file)
  };
}

const inEvidence = (body) => run(makeCtx({ "src/evidence/dialogs.ts": `export const item: C = ${body};` }));

// --- Flagged: a property arriving through a spread of a fresh value. ---

test("a conditional spread is flagged -- the original defect", () => {
  const findings = inEvidence("{ selector, ...(label ? { label } : {}) }");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].severity, "fail");
  assert.equal(findings[0].ratchet, true);
  assert.equal(findings[0].value, 1);
  assert.equal(findings[0].key, "src/evidence/dialogs.ts");
});

test("the same defect spelled with && or ?? is flagged", () => {
  assert.equal(inEvidence("{ selector, ...(label && { label }) }").length, 1);
  assert.equal(inEvidence("{ selector, ...(fields ?? {}) }").length, 1);
});

test("an inline object literal spread is flagged", () => {
  assert.equal(inEvidence("{ selector, ...{ label } }").length, 1);
});

test("a call whose return type restates contract keys is flagged", () => {
  // `boundsOrNone(): { bounds?: Rect }` was a real restatement in the repository.
  assert.equal(inEvidence("{ selector, ...boundsOrNone(bounds) }").length, 1);
  assert.equal(inEvidence("{ selector, ...this.reader.boundsOrNone() }").length, 1);
});

test("a cast is flagged, because a cast is how a restatement gets in", () => {
  assert.equal(inEvidence("{ selector, ...(value as Contract) }").length, 1);
});

test("every offending spread in a file is counted into one ratcheted finding", () => {
  const findings = inEvidence("{ ...(a ? { a } : {}), ...(b ? { b } : {}), ...c }");
  assert.equal(findings.length, 1);
  assert.equal(findings[0].value, 2);
  assert.match(findings[0].message, /2 properties spread into object literals, at lines 1, 1/);
});

// --- Not flagged: the copy-with-override form, and everything outside. ---

test("spreading a named value is not flagged", () => {
  assert.equal(inEvidence("{ ...snapshot, interactiveElements: merged }").length, 0);
  assert.equal(inEvidence("{ ...this.state, one: change }").length, 0);
  assert.equal(inEvidence("{ ...entry.snapshot.evidence, one: change }").length, 0);
  assert.equal(inEvidence("{ ...byId[key], one: change }").length, 0);
});

test("parentheses and a non-null assertion are transparent", () => {
  assert.equal(inEvidence("{ ...(evidence), ...child.evidence! }").length, 0);
});

test("an array or call spread is not an object spread", () => {
  const files = { "src/evidence/page.ts": "export const xs = [...items, ...list.values()]; export const y = f(...args);" };
  assert.equal(run(makeCtx(files)).length, 0);
});

test("a file outside every configured path is not flagged", () => {
  const body = "export const item: C = { selector, ...(label ? { label } : {}) };";
  assert.equal(run(makeCtx({ "src/elsewhere/thing.ts": body })).length, 0);
  // The configured single file is matched exactly; its siblings are not.
  assert.equal(run(makeCtx({ "src/merge/other.ts": body })).length, 0);
  assert.equal(run(makeCtx({ "src/merge/snapshot.ts": body })).length, 1);
});

test("a path prefix does not match a sibling directory sharing its name", () => {
  const body = "export const item: C = { selector, ...(label ? { label } : {}) };";
  assert.equal(run(makeCtx({ "src/evidence-legacy/dialogs.ts": body })).length, 0);
});

test("no configured paths means the rule reports nothing at all", () => {
  const body = "export const item: C = { selector, ...(label ? { label } : {}) };";
  assert.equal(run(makeCtx({ "src/evidence/dialogs.ts": body }, [])).length, 0);
  // A repository whose config predates the rule has no key at all.
  const ctx = makeCtx({ "src/evidence/dialogs.ts": body }, []);
  ctx.CONFIG = {};
  assert.equal(run(ctx).length, 0);
});

// --- The message has to tell a developer what to do. ---

test("the message carries the configured reason and remedy", () => {
  const message = inEvidence("{ selector, ...(label ? { label } : {}) }")[0].message;
  assert.match(message, /these modules build page evidence/);
  assert.match(message, /Use present<T>\(\)\./);
  assert.match(message, /no excess-property check/);
  assert.match(message, /Spreading a named value of the same type/);
});

test("an entry with no remedy still says what to do", () => {
  const files = { "src/merge/snapshot.ts": "export const item: C = { ...(a ? { a } : {}) };" };
  const message = run(makeCtx(files))[0].message;
  assert.match(message, /this file merges page evidence/);
  assert.match(message, /Write each field by name\./);
});

test("the longest configured path wins, so a file may carry a narrower reason", () => {
  const paths = [
    { path: "src/evidence", reason: "the directory reason", remedy: "Directory remedy." },
    { path: "src/evidence/dialogs.ts", reason: "the file reason", remedy: "File remedy." }
  ];
  const files = { "src/evidence/dialogs.ts": "export const item: C = { ...(a ? { a } : {}) };" };
  assert.match(run(makeCtx(files, paths))[0].message, /the file reason/);
});
