// Unit tests for the regexp-template-escapes rule. The rule reaches the
// repository only through ctx, so these build a fake ctx by hand over
// in-memory fixtures: no git, no filesystem.
//
// The rule exists because `new RegExp(`\b${word}\b`)` hands the regex a
// backspace, not a word boundary, and two Core tests silently never ran their
// check that way. Fixture source is assembled with B (one backslash) so what
// each case holds is exactly what is written, with no second layer of escaping.

import test from "node:test";
import assert from "node:assert/strict";
import ts from "typescript";
import { run } from "../regexp-template-escapes.mjs";

const B = String.fromCharCode(92);
const TICK = "`";

function makeCtx(files) {
  const astCache = new Map();
  return {
    ts,
    scriptFiles: Object.keys(files),
    normalize: (file) => file,
    parse: (file) => {
      if (!astCache.has(file)) astCache.set(file, ts.createSourceFile(file, files[file], ts.ScriptTarget.Latest, true, ts.ScriptKind.TS));
      return astCache.get(file);
    }
  };
}

const findingsIn = (source, file = "src/guidance/tests/guidance.test.ts") => run(makeCtx({ [file]: source }));
const count = (source) => findingsIn(source).length;

// --- Flagged: an escape the string swallows before the regex sees it. ---

test("a word boundary in a template literal is one failing finding at its line, naming the backspace and the fix", () => {
  const findings = findingsIn(`const word = "flow";\nconst pattern = new RegExp(${TICK}${B}b\${word}s?${TICK});\n`);
  assert.equal(findings.length, 1);
  const [finding] = findings;
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, false);
  assert.equal(finding.line, 2);
  assert.equal(finding.path, "src/guidance/tests/guidance.test.ts");
  assert.match(finding.message, /backspace \(U\+0008\), not a word boundary/);
  assert.ok(finding.message.includes(`"${B}${B}b"`), finding.message);
  assert.match(finding.message, /String\.raw/);
});

test("each swallowed escape is its own finding, including both ends of a word", () => {
  assert.equal(count(`new RegExp(${TICK}${B}b\${word}${B}b${TICK});`), 2);
  assert.equal(count(`new RegExp(${TICK}${B}d+${B}s${B}w${TICK});`), 3);
});

test("every class escape and regex syntax character is flagged in string and template literals alike", () => {
  for (const escape of ["b", "B", "d", "D", "s", "S", "w", "W", "p", "k", ".", "(", ")", "[", "]", "{", "}", "*", "+", "?", "^", "$", "|", "-"]) {
    assert.equal(count(`new RegExp("a${B}${escape}");`), 1, `string ${B}${escape}`);
    assert.equal(count(`new RegExp(${TICK}a${B}${escape}${TICK});`), 1, `template ${B}${escape}`);
  }
});

test("RegExp called without new, through globalThis, and with flags is still read", () => {
  assert.equal(count(`RegExp("${B}d+", "u");`), 1);
  assert.equal(count(`new globalThis.RegExp("${B}d+");`), 1);
  assert.equal(count(`new RegExp(${TICK}^${B}w+\${suffix}${B}.json$${TICK}, "i");`), 2);
});

test("an escape in a template span after a substitution, or in a + concatenation, is found", () => {
  assert.equal(count(`new RegExp(${TICK}^\${a}-\${b}${B}s*$${TICK});`), 1);
  assert.equal(count(`new RegExp("^" + name + "${B}b");`), 1);
  assert.equal(count(`new RegExp(("${B}d"));`), 1);
});

test("the message names the template or string literal the escape was lost in", () => {
  assert.match(findingsIn(`new RegExp(${TICK}${B}d${TICK});`)[0].message, /template literal reads it first and the regex receives the plain letter "d"/);
  assert.match(findingsIn(`new RegExp("${B}.");`)[0].message, /string literal reads it first and the regex receives a bare "\."/);
});

// --- Allowed: the regex receives the escape it was written with. ---

test("a doubled backslash is the fix and is not counted", () => {
  assert.equal(count(`new RegExp(${TICK}${B}${B}b\${word}${B}${B}b${TICK});`), 0);
  assert.equal(count(`new RegExp("${B}${B}d+${B}${B}.${B}${B}s");`), 0);
  assert.equal(count(`new RegExp("${B}${B}${B}${B}");`), 0);
});

test("a String.raw template keeps its backslashes and is not counted", () => {
  assert.equal(count(`new RegExp(String.raw${TICK}${B}b\${word}${B}d+${TICK});`), 0);
});

test("string escapes that become the character the regex escape would match are not counted", () => {
  assert.equal(count(`new RegExp("a${B}nb${B}tc${B}rd${B}v${B}f${B}x41${B}u0041");`), 0);
  assert.equal(count(`new RegExp(${TICK}${B}${TICK}${B}'${B}"${TICK});`), 0);
});

test("regex literals, other calls, and patterns held in a variable are not read", () => {
  assert.equal(count(`const a = /${B}bword${B}b/;`), 0);
  assert.equal(count(`const b = "${B}d"; matchAll(${TICK}${B}b${TICK});`), 0);
  assert.equal(count(`const source = ${TICK}${B}b${TICK}; new RegExp(source);`), 0);
  assert.equal(count(`new RegExp();`), 0);
});
