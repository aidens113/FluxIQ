#!/usr/bin/env node
// Structure audit: runs every rule under scripts/structure-audit/rules/ and
// fails the build on any violation not covered by the ratcheted baseline.
//
// Usage:
//   node scripts/structure-audit.mjs                 check; exit 1 on failure
//   node scripts/structure-audit.mjs --update        lower the baseline to current values
//   node scripts/structure-audit.mjs --rule <id>     run one rule (repeatable)
//   node scripts/structure-audit.mjs --json          machine-readable output
//   node scripts/structure-audit.mjs --list          list rule ids and titles
//
// The rule contract and finding shape are documented in
// scripts/structure-audit/context.mjs. The ratchet is in baseline.mjs.

import { readdirSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createContext, LIMITS, repoRoot } from "./structure-audit/context.mjs";
import { applyRatchet, buildBaseline, loadBaseline, saveBaseline } from "./structure-audit/baseline.mjs";

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

if (flags.has("--update")) {
  const baseline = buildBaseline(findings, previous, LIMITS);
  saveBaseline(repoRoot, baseline);
  for (const rule of selected) if (typeof rule.update === "function") rule.update(ctx);
  const entries = Object.values(baseline.rules).reduce((n, keys) => n + Object.keys(keys).length, 0);
  console.log(`structure-audit: baseline written with ${entries} entries across ${Object.keys(baseline.rules).length} rules.`);
  process.exit(0);
}

const result = applyRatchet(findings, previous);

if (flags.has("--json")) {
  console.log(JSON.stringify({ failures: result.failures, warnings: result.warnings, suppressed: result.suppressed.length, lowerable: result.lowerable }, null, 2));
  process.exit(result.failures.length > 0 ? 1 : 0);
}

const byRule = (list) => list.sort((a, b) => a.rule.localeCompare(b.rule) || a.path.localeCompare(b.path));
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
