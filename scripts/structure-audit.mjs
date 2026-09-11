#!/usr/bin/env node
// Structure audit: runs every rule under scripts/structure-audit/rules/ and
// fails the build on any violation not covered by the ratcheted baseline.
//
// Usage:
//   node scripts/structure-audit.mjs                 check; exit 1 on failure
//   node scripts/structure-audit.mjs --update        lower or remove baseline entries to match
//                                                    current values; exit 1 and write nothing
//                                                    when a violation has no entry or grew
//   node scripts/structure-audit.mjs --rule <id>     run one rule (repeatable); with --update,
//                                                    only the selected rules' entries change
//   node scripts/structure-audit.mjs --json          machine-readable output
//   node scripts/structure-audit.mjs --list          list rule ids and titles
//
// The rule contract and finding shape are documented in
// scripts/structure-audit/context.mjs. The ratchet is in baseline.mjs.

import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContext, LIMITS, repoRoot } from "./structure-audit/context.mjs";
import { applyRatchet, BASELINE_FILE, loadBaseline, planBaselineUpdate, saveBaseline } from "./structure-audit/baseline.mjs";

const args = process.argv.slice(2);
const flags = new Set(args.filter((arg) => arg.startsWith("--") && arg !== "--rule"));
const only = new Set();
for (let i = 0; i < args.length; i += 1) if (args[i] === "--rule" && args[i + 1]) only.add(args[i + 1]);

const rulesDir = path.join(repoRoot, "scripts", "structure-audit", "rules");
const ruleFiles = readdirSync(rulesDir).filter((name) => name.endsWith(".mjs")).sort();
const rules = [];
for (const name of ruleFiles) {
  const mod = await import(pathToFileURL(path.join(rulesDir, name)).href);
  if (!mod.id || typeof mod.run !== "function") throw new Error(`rule ${name} does not export id and run()`);
  rules.push(mod);
}

if (flags.has("--list")) {
  for (const rule of rules) console.log(`${rule.id.padEnd(22)} ${rule.title ?? ""}`);
  process.exit(0);
}

const ctx = createContext();
const selected = only.size > 0 ? rules.filter((rule) => only.has(rule.id)) : rules;
if (only.size > 0 && selected.length !== only.size) {
  const known = new Set(rules.map((rule) => rule.id));
  for (const id of only) if (!known.has(id)) console.error(`unknown rule: ${id}`);
  process.exit(2);
}

const findings = [];
for (const rule of selected) {
  for (const finding of rule.run(ctx)) findings.push({ ...finding, rule: rule.id });
}

const previous = loadBaseline(repoRoot);
const byRule = (list) => list.sort((a, b) => a.rule.localeCompare(b.rule) || a.path.localeCompare(b.path));

if (flags.has("--update")) {
  // With --rule, only the selected rules' findings are complete, so only
  // their entries may change; every other rule's entries are kept as recorded.
  const scope = only.size > 0 ? selected.map((rule) => rule.id) : null;
  const plan = planBaselineUpdate(findings, previous, LIMITS, scope);
  if (plan.blocked.length > 0) {
    for (const finding of byRule(plan.blocked)) console.error(`  FAIL  [${finding.rule}] ${finding.message}`);
    console.error(`\nstructure-audit: --update refused: ${plan.blocked.length} violation(s) cannot be recorded by lowering the baseline. Fix them, then run it again. ${BASELINE_FILE} was not written.`);
    process.exit(1);
  }
  const written = saveBaseline(repoRoot, plan.baseline);
  for (const rule of selected) if (typeof rule.update === "function") rule.update(ctx);
  for (const entry of plan.lowered) console.log(`  lowered [${entry.rule}] ${entry.key}: ${entry.recorded} -> ${entry.value}`);
  for (const entry of plan.removed) console.log(`  removed [${entry.rule}] ${entry.key} (was ${entry.recorded})`);
  const entries = Object.values(plan.baseline.rules).reduce((n, keys) => n + Object.keys(keys).length, 0);
  const outcome = written ? "baseline written" : "baseline already current, not rewritten";
  const kept = scope === null ? "" : ` Re-evaluated ${scope.join(", ")} only; other rules' entries kept.`;
  console.log(`structure-audit: ${outcome}: ${entries} entries across ${Object.keys(plan.baseline.rules).length} rules (${plan.lowered.length} lowered, ${plan.removed.length} removed).${kept}`);
  process.exit(0);
}

const result = applyRatchet(findings, previous);

if (flags.has("--json")) {
  console.log(JSON.stringify({ failures: result.failures, warnings: result.warnings, suppressed: result.suppressed.length, lowerable: result.lowerable }, null, 2));
  process.exit(result.failures.length > 0 ? 1 : 0);
}

for (const warning of byRule(result.warnings)) console.warn(`  warn  [${warning.rule}] ${warning.message}`);
for (const failure of byRule(result.failures)) console.error(`  FAIL  [${failure.rule}] ${failure.message}`);

if (result.lowerable.length > 0) {
  console.log(`\nstructure-audit: ${result.lowerable.length} baseline entries can be lowered. Run "pnpm structure:baseline" to record the improvement.`);
}

if (result.failures.length > 0) {
  console.error(`\nstructure-audit: ${result.failures.length} violation(s) across ${new Set(result.failures.map((f) => f.rule)).size} rule(s).`);
  process.exit(1);
}

console.log(`structure-audit: passed (${result.warnings.length} warning(s), ${result.suppressed.length} baselined).`);
