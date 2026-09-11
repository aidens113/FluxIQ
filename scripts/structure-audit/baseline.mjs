// The ratchet. Existing violations are recorded per rule and per key; a
// recorded entry may only ever be lowered. A fail finding with ratchet:true
// is suppressed while its value is at or below the recorded value, fails when
// it exceeds it, and fails outright when there is no record.
//
// --update obeys the same law: it lowers an entry to its current value and
// removes an entry whose violation is gone, and it never adds or raises one.
// A ratcheted violation with no entry, or above its entry, blocks the update
// and nothing is written.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const BASELINE_FILE = ".structure-baseline.json";

const COMMENT = "Ratcheted structure budgets, per rule and per key. Entries may only be lowered, never raised. Regenerate with: pnpm structure:baseline";

export function loadBaseline(repoRoot) {
  const file = path.join(repoRoot, BASELINE_FILE);
  if (!existsSync(file)) return { rules: {} };
  const parsed = JSON.parse(readFileSync(file, "utf8"));
  if (parsed.rules) return { rules: parsed.rules };
  // Migrate the v1 shape ({ files, directories }) written before rules were modular.
  return {
    rules: {
      "file-lines": parsed.files ?? {},
      "directory-files": parsed.directories ?? {}
    }
  };
}

export function applyRatchet(findings, baseline) {
  const failures = [];
  const warnings = [];
  const suppressed = [];
  const lowerable = [];

  for (const finding of findings) {
    if (finding.severity === "warn") {
      warnings.push(finding);
      continue;
    }
    if (!finding.ratchet) {
      failures.push(finding);
      continue;
    }
    const recorded = baseline.rules[finding.rule]?.[finding.key];
    if (recorded === undefined) {
      failures.push(finding);
    } else if (finding.value > recorded) {
      failures.push({ ...finding, message: `${finding.message} Baseline for this entry is ${recorded}; baselined entries may shrink, never grow.` });
    } else {
      suppressed.push(finding);
      if (finding.value < recorded) lowerable.push({ ...finding, recorded });
    }
  }

  return { failures, warnings, suppressed, lowerable };
}

// Plans a --update from the current findings.
//
// `scope` lists the rule ids that ran, so that `findings` is complete for
// them. Only those rules' entries are re-evaluated; every other rule's entries
// are carried over unchanged, so a `--rule` update never drops another rule's
// baseline. `null` means a full update: every rule in the previous baseline is
// re-evaluated, and a rule id that no longer reports anything loses its
// entries.
//
// Returns { baseline, blocked, lowered, removed }. `blocked` holds each
// ratcheted violation that lowering cannot record: `recorded` is undefined
// when it has no entry and is the entry's value when it grew past it. When
// `blocked` is not empty the caller must write nothing; `baseline` still holds
// no added or raised entry.
export function planBaselineUpdate(findings, previous, limits, scope = null) {
  const scoped = scope === null ? null : new Set(scope);
  const evaluated = (rule) => scoped === null || scoped.has(rule);

  // An entry must cover every finding the check compares against it, so the
  // current value of a key is the highest among its findings.
  const current = new Map();
  for (const finding of findings) {
    if (finding.severity !== "fail" || !finding.ratchet || !evaluated(finding.rule)) continue;
    const id = JSON.stringify([finding.rule, finding.key]);
    if (!current.has(id) || finding.value > current.get(id).value) current.set(id, finding);
  }

  const rules = {};
  const blocked = [];
  for (const finding of current.values()) {
    const recorded = previous.rules[finding.rule]?.[finding.key];
    if (recorded === undefined) {
      blocked.push({ ...finding, recorded, message: `${finding.message} It has no baseline entry, and --update never adds one.` });
      continue;
    }
    if (finding.value > recorded) {
      blocked.push({ ...finding, recorded, message: `${finding.message} Baseline for this entry is ${recorded}; --update never raises an entry.` });
    }
    rules[finding.rule] ??= {};
    rules[finding.rule][finding.key] = Math.min(recorded, finding.value);
  }

  const lowered = [];
  const removed = [];
  for (const [rule, entries] of Object.entries(previous.rules)) {
    if (!evaluated(rule)) {
      rules[rule] = { ...entries };
      continue;
    }
    for (const [key, recorded] of Object.entries(entries)) {
      const value = rules[rule]?.[key];
      if (value === undefined) removed.push({ rule, key, recorded });
      else if (value < recorded) lowered.push({ rule, key, recorded, value });
    }
  }

  return { baseline: canonical(rules, limits), blocked, lowered, removed };
}

// Rules sorted by id; entries by value, highest first, then by key. An
// unchanged baseline therefore serialises to the same bytes on every run.
function canonical(rules, limits) {
  const byValueThenKey = (a, b) => b[1] - a[1] || a[0].localeCompare(b[0]);
  return {
    comment: COMMENT,
    limits,
    rules: Object.fromEntries(
      Object.keys(rules)
        .sort((a, b) => a.localeCompare(b))
        .map((rule) => [rule, Object.fromEntries(Object.entries(rules[rule]).sort(byValueThenKey))])
    )
  };
}

// Writes the baseline and returns true, or returns false without touching the
// file when it already holds exactly this content, line endings aside.
export function saveBaseline(repoRoot, baseline) {
  const file = path.join(repoRoot, BASELINE_FILE);
  const text = `${JSON.stringify(baseline, null, 2)}\n`;
  if (existsSync(file) && readFileSync(file, "utf8").replaceAll("\r\n", "\n") === text) return false;
  writeFileSync(file, text, "utf8");
  return true;
}
