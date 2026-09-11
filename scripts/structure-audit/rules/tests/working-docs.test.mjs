// Unit tests for the working-docs rule. The rule only ever reaches the
// repository through ctx, so these build a fake ctx by hand and hold the
// fixtures in memory: no git, no filesystem, no import of context.mjs.
//
// run() also checks the generated index, which never matches an in-memory
// fixture set, so every assertion filters findings down to the document under
// test by key.

import test from "node:test";
import assert from "node:assert/strict";
import { run } from "../working-docs.mjs";

const LIMITS = { workingDocLines: 800, workingDocCurrentStateLines: 150 };
const CONFIG = { workingDocsDir: "docs/working", workingDocsIndexKind: "core" };

const DOC = "docs/working/example-plan.md";

// Only the members working-docs.mjs touches, with the shapes documented in
// scripts/structure-audit/context.mjs.
function makeCtx(files) {
  const read = (file) => files[file];
  const lineCount = (file) => {
    const text = read(file);
    if (text === "") return 0;
    const lines = text.split("\n");
    if (lines.at(-1) === "") lines.pop();
    return lines.length;
  };
  return {
    LIMITS,
    CONFIG,
    trackedFiles: Object.keys(files),
    read,
    lineCount,
    basename: (file) => file.split("/").at(-1)
  };
}

// Findings about one document: its own key plus the `#current-state` and
// `#ledger` sub-keys.
function findingsFor(text, file = DOC) {
  return run(makeCtx({ [file]: text })).filter((finding) => finding.key === file || finding.key.startsWith(`${file}#`));
}

const findingByKey = (text, suffix) => findingsFor(text).find((finding) => finding.key === `${DOC}#${suffix}`);

const HEADER = [
  "# Example Plan",
  "",
  "Status: Active",
  "Status detail: In progress",
  "Created: 2026-01-01",
  "Last updated: 2026-01-02",
  "Owner: supervisor",
  "Scope: the example",
  "Paired document: none",
  "Related: none"
];

const CURRENT_STATE = ["", "## Current State", "", "Everything is fine.", ""];

const GOOD_ENTRY = [
  "### 2026-01-02 — Something was done",
  "- Agent: supervisor",
  "- Changed: one file",
  "- Why: it needed doing",
  "- Validation: `node --test` -> 6 tests passed, 0 failed",
  "- Outcome: Accepted",
  "- Follow-up: none",
  ""
];

// Assembles a document from line arrays; `\n` endings unless crlf is asked for.
function doc(sections, { crlf = false } = {}) {
  const text = `${sections.flat().join("\n")}\n`;
  return crlf ? text.replaceAll("\n", "\r\n") : text;
}

const LEDGER = (entries) => ["## Work Ledger", "", ...entries.flat()];

test("a conforming document produces no findings", () => {
  const text = doc([HEADER, CURRENT_STATE, LEDGER([GOOD_ENTRY])]);
  assert.deepEqual(findingsFor(text), []);
});

test("a Current State over the budget fails, ratcheted, with its measured length", () => {
  const body = Array.from({ length: 200 }, (_, index) => `Line ${index + 1}.`);
  const text = doc([HEADER, ["", "## Current State", "", ...body, ""], LEDGER([GOOD_ENTRY])]);
  const finding = findingByKey(text, "current-state");

  assert.ok(finding, "expected a #current-state finding");
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, true);
  assert.equal(finding.limit, 150);
  // Heading + blank + 200 body lines + trailing blank, up to the `## Work Ledger` heading.
  assert.equal(finding.value, 203);
  assert.equal(finding.path, DOC);
  assert.match(finding.message, /203 lines, over the 150-line budget/);
});

test("a Current State at the budget passes", () => {
  const body = Array.from({ length: 148 }, (_, index) => `Line ${index + 1}.`);
  const text = doc([HEADER, ["", "## Current State", ...body, ""], LEDGER([GOOD_ENTRY])]);
  assert.equal(findingByKey(text, "current-state"), undefined);
});

test("Current State length is measured to the next H2, not the next H3", () => {
  const body = Array.from({ length: 200 }, (_, index) => (index === 100 ? "### A subheading" : `Line ${index}.`));
  const text = doc([HEADER, ["", "## Current State", ...body], LEDGER([GOOD_ENTRY])]);
  assert.ok(findingByKey(text, "current-state"), "an H3 must not end the section");
});

test("an entry with no Validation bullet fails and is named", () => {
  const entry = GOOD_ENTRY.filter((line) => !line.startsWith("- Validation:"));
  const text = doc([HEADER, CURRENT_STATE, LEDGER([entry])]);
  const finding = findingByKey(text, "ledger");

  assert.ok(finding, "expected a #ledger finding");
  assert.equal(finding.severity, "fail");
  assert.equal(finding.ratchet, true);
  assert.equal(finding.limit, 0);
  assert.equal(finding.value, 1);
  assert.match(finding.message, /2026-01-02 — Something was done/);
  assert.match(finding.message, /no "- Validation:" bullet/);
});

test("a Validation bullet that repeats a report fails", () => {
  const entry = GOOD_ENTRY.map((line) =>
    line.startsWith("- Validation:") ? "- Validation: the worker reported success" : line);
  const text = doc([HEADER, CURRENT_STATE, LEDGER([entry])]);
  const finding = findingByKey(text, "ledger");

  assert.ok(finding, "expected a #ledger finding");
  assert.equal(finding.value, 1);
  assert.match(finding.message, /repeats a report instead of a result/);
});

test("a forbidden phrase split across a continuation line is still caught", () => {
  const entry = [
    "### 2026-01-03 — Wrapped validation",
    "- Agent: supervisor",
    "- Validation: three workers were dispatched and each one of the three",
    "  workers said the suite passed, so it passed",
    "- Outcome: Accepted",
    ""
  ];
  const text = doc([HEADER, CURRENT_STATE, LEDGER([entry])]);
  assert.equal(findingByKey(text, "ledger")?.value, 1);
});

test("offending entries are counted together in one finding per document", () => {
  const missing = GOOD_ENTRY.filter((line) => !line.startsWith("- Validation:"));
  const hearsay = ["### 2026-01-04 — Hearsay", "- Validation: workers claimed it built", ""];
  const text = doc([HEADER, CURRENT_STATE, LEDGER([GOOD_ENTRY, missing, hearsay])]);
  const ledgerFindings = findingsFor(text).filter((finding) => finding.key === `${DOC}#ledger`);

  assert.equal(ledgerFindings.length, 1);
  assert.equal(ledgerFindings[0].value, 2);
});

test("an H3 after the ledger section is not treated as a ledger entry", () => {
  const text = doc([
    HEADER,
    CURRENT_STATE,
    LEDGER([GOOD_ENTRY]),
    ["## Open Questions", "", "### Something unresolved", "", "No validation bullet here.", ""]
  ]);
  assert.equal(findingByKey(text, "ledger"), undefined);
});

test("a document with no ledger produces no ledger finding", () => {
  const text = doc([HEADER, CURRENT_STATE, ["## Notes", "", "No ledger at all.", ""]]);
  assert.equal(findingByKey(text, "ledger"), undefined);
});

test("CRLF documents are parsed the same as LF ones", () => {
  const clean = doc([HEADER, CURRENT_STATE, LEDGER([GOOD_ENTRY])], { crlf: true });
  assert.deepEqual(findingsFor(clean), []);

  const entry = GOOD_ENTRY.filter((line) => !line.startsWith("- Validation:"));
  const body = Array.from({ length: 200 }, (_, index) => `Line ${index + 1}.`);
  const dirty = doc([HEADER, ["", "## Current State", "", ...body, ""], LEDGER([entry])], { crlf: true });
  const keys = findingsFor(dirty).map((finding) => finding.key).sort();

  assert.deepEqual(keys, [`${DOC}#current-state`, `${DOC}#ledger`]);
});
