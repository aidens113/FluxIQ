// Unit tests for the baseline ratchet in ../baseline.mjs. planBaselineUpdate
// and applyRatchet are pure, so findings and baselines are built in memory;
// only the saveBaseline test touches the filesystem, in a temporary directory.
//
// The law under test: --update lowers an entry to its current value or
// removes one whose violation is gone, and nothing else. A ratcheted violation
// with no entry, or above its entry, blocks the update, and a rule-scoped
// update leaves every other rule's entries alone.

import test from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { applyRatchet, BASELINE_FILE, planBaselineUpdate, saveBaseline } from "../baseline.mjs";

const LIMITS = { fileLines: 800 };

// The finding shape documented in scripts/structure-audit/context.mjs.
function fail(rule, key, value, ratchet = true) {
  return { rule, key, value, limit: 0, path: key, message: `${key}: measured ${value}.`, severity: "fail", ratchet };
}

const warn = (rule, key, value) => ({ ...fail(rule, key, value, false), severity: "warn" });

const baselineOf = (rules) => ({ rules });

test("an update lowers an entry to its current value and removes one whose violation is gone", () => {
  const previous = baselineOf({ "file-lines": { "a.ts": 900, "b.ts": 850, "c.ts": 820 } });
  const plan = planBaselineUpdate([fail("file-lines", "a.ts", 900), fail("file-lines", "b.ts", 810)], previous, LIMITS);

  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.baseline.rules, { "file-lines": { "a.ts": 900, "b.ts": 810 } });
  assert.deepEqual(plan.lowered, [{ rule: "file-lines", key: "b.ts", recorded: 850, value: 810 }]);
  assert.deepEqual(plan.removed, [{ rule: "file-lines", key: "c.ts", recorded: 820 }]);
});

test("a violation with no entry blocks the update and is never added", () => {
  const previous = baselineOf({ "file-lines": { "a.ts": 900 } });
  const plan = planBaselineUpdate([fail("file-lines", "a.ts", 900), fail("file-lines", "new.ts", 801)], previous, LIMITS);

  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.blocked[0].key, "new.ts");
  assert.equal(plan.blocked[0].recorded, undefined);
  assert.match(plan.blocked[0].message, /^new\.ts: measured 801\. It has no baseline entry/);
  assert.deepEqual(plan.baseline.rules, { "file-lines": { "a.ts": 900 } });
});

test("a violation above its entry blocks the update and the entry is not raised", () => {
  const previous = baselineOf({ "file-lines": { "a.ts": 900 } });
  const plan = planBaselineUpdate([fail("file-lines", "a.ts", 950)], previous, LIMITS);

  assert.equal(plan.blocked.length, 1);
  assert.equal(plan.blocked[0].recorded, 900);
  assert.match(plan.blocked[0].message, /Baseline for this entry is 900/);
  assert.deepEqual(plan.baseline.rules, { "file-lines": { "a.ts": 900 } });
  assert.deepEqual(plan.lowered, []);
  assert.deepEqual(plan.removed, []);
});

test("a rule-scoped update keeps every other rule's entries unchanged", () => {
  const previous = baselineOf({
    "file-lines": { "a.ts": 900, "gone.ts": 850 },
    imports: { "x.ts": 3 },
    naming: { "y.ts": 1 }
  });
  // Only file-lines ran, so there are no imports or naming findings at all.
  const plan = planBaselineUpdate([fail("file-lines", "a.ts", 880)], previous, LIMITS, ["file-lines"]);

  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.baseline.rules, { "file-lines": { "a.ts": 880 }, imports: { "x.ts": 3 }, naming: { "y.ts": 1 } });
  assert.deepEqual(plan.lowered, [{ rule: "file-lines", key: "a.ts", recorded: 900, value: 880 }]);
  assert.deepEqual(plan.removed, [{ rule: "file-lines", key: "gone.ts", recorded: 850 }]);
});

test("a full update removes the entries of a rule id that no longer reports", () => {
  const previous = baselineOf({ "file-lines": { "a.ts": 900 }, "retired-rule": { "z.ts": 2 } });
  const plan = planBaselineUpdate([fail("file-lines", "a.ts", 900)], previous, LIMITS);

  assert.deepEqual(plan.baseline.rules, { "file-lines": { "a.ts": 900 } });
  assert.deepEqual(plan.removed, [{ rule: "retired-rule", key: "z.ts", recorded: 2 }]);
});

test("warnings and unratcheted failures neither block an update nor create entries", () => {
  const plan = planBaselineUpdate([warn("file-lines", "w.ts", 500), fail("imports", "i.ts", 1, false)], baselineOf({}), LIMITS);

  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(plan.baseline.rules, {});
});

test("an entry must cover the highest of several findings under one key", () => {
  const previous = baselineOf({ "working-docs": { "doc.md": 10 } });

  const lowered = planBaselineUpdate([fail("working-docs", "doc.md", 4), fail("working-docs", "doc.md", 7)], previous, LIMITS);
  assert.deepEqual(lowered.baseline.rules, { "working-docs": { "doc.md": 7 } });

  const grown = planBaselineUpdate([fail("working-docs", "doc.md", 4), fail("working-docs", "doc.md", 12)], previous, LIMITS);
  assert.equal(grown.blocked.length, 1);
  assert.equal(grown.blocked[0].value, 12);
});

test("the planned baseline is canonical: rules by id, entries by value then key, current limits", () => {
  const previous = baselineOf({ naming: { "b.ts": 1, "a.ts": 1 }, "file-lines": { "small.ts": 810, "big.ts": 900 } });
  const findings = [fail("naming", "b.ts", 1), fail("naming", "a.ts", 1), fail("file-lines", "small.ts", 810), fail("file-lines", "big.ts", 900)];
  const { baseline } = planBaselineUpdate(findings, previous, LIMITS);

  assert.deepEqual(Object.keys(baseline.rules), ["file-lines", "naming"]);
  assert.deepEqual(Object.keys(baseline.rules["file-lines"]), ["big.ts", "small.ts"]);
  assert.deepEqual(Object.keys(baseline.rules.naming), ["a.ts", "b.ts"]);
  assert.equal(baseline.limits, LIMITS);
});

test("every violation a successful update records is suppressed by the check", () => {
  const findings = [fail("file-lines", "a.ts", 850), fail("naming", "n.ts", 1), fail("imports", "i.ts", 1, false)];
  const previous = baselineOf({ "file-lines": { "a.ts": 900 }, naming: { "n.ts": 1 } });
  const plan = planBaselineUpdate(findings, previous, LIMITS);
  const result = applyRatchet(findings, plan.baseline);

  assert.deepEqual(plan.blocked, []);
  assert.deepEqual(result.failures.map((finding) => finding.key), ["i.ts"]);
  assert.deepEqual(result.lowerable, []);
});

test("saveBaseline leaves a file that already holds the content untouched", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "structure-baseline-"));
  try {
    const file = path.join(dir, BASELINE_FILE);
    const { baseline } = planBaselineUpdate([], baselineOf({}), LIMITS);
    assert.equal(saveBaseline(dir, baseline), true);

    // The same content with CRLF line endings, as a Windows checkout may hold it.
    const crlf = readFileSync(file, "utf8").replaceAll("\n", "\r\n");
    writeFileSync(file, crlf, "utf8");
    assert.equal(saveBaseline(dir, baseline), false);
    assert.equal(readFileSync(file, "utf8"), crlf);

    assert.equal(saveBaseline(dir, { ...baseline, rules: { naming: { "a.ts": 1 } } }), true);
    assert.deepEqual(JSON.parse(readFileSync(file, "utf8")).rules, { naming: { "a.ts": 1 } });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
