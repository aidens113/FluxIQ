// The ratchet. Existing violations are recorded per rule and per key; a
// recorded entry may only ever be lowered. A fail finding with ratchet:true
// is suppressed while its value is at or below the recorded value, fails when
// it exceeds it, and fails outright when there is no record.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

export const BASELINE_FILE = ".structure-baseline.json";

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

export function buildBaseline(findings, previous, limits) {
  const rules = {};
  for (const finding of findings) {
    if (finding.severity !== "fail" || !finding.ratchet) continue;
    const prior = previous.rules[finding.rule]?.[finding.key];
    const value = prior === undefined ? finding.value : Math.min(prior, finding.value);
    rules[finding.rule] ??= {};
    rules[finding.rule][finding.key] = value;
  }
  for (const rule of Object.keys(rules)) {
    rules[rule] = Object.fromEntries(
      Object.entries(rules[rule]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    );
  }
  return {
    comment: "Ratcheted structure budgets, per rule and per key. Entries may only be lowered, never raised. Regenerate with: pnpm structure:baseline",
    limits,
    rules: Object.fromEntries(Object.entries(rules).sort((a, b) => a[0].localeCompare(b[0])))
  };
}

export function saveBaseline(repoRoot, baseline) {
  writeFileSync(path.join(repoRoot, BASELINE_FILE), `${JSON.stringify(baseline, null, 2)}\n`, "utf8");
}
