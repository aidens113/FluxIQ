// No module a browser bundle loads may import a Node built-in or a Node-only
// package.
//
// Why. On 2026-09-30 `runtime/parking/person-needed-tool-calls.ts` imported
// `node:crypto`. The web extension's browser bundle reaches the parking barrel
// through `automation-studio/nodes` (`nodes/routine/approval.ts` ->
// `runtime/parking/index.ts`), so the extension could no longer load. Core's
// type check passed, because the import type-checks: what fails is loading it
// in a browser. The downstream bundle check missed it too, because it bundles
// against Core's built `dist/` and that build was stale. Only a live Lab run
// caught it. This rule catches the class in Core's own `pnpm check`, before
// any build.
//
// What is walked. `CONFIG.browserBundles.entries` names where each browser
// bundle enters this repository. From them the rule follows every value
// import that survives compilation (type-only imports are erased and are not
// followed): relative imports to their source files, and imports of this
// repository's workspace packages through their `exports` into source. The
// reachable set is the real import graph, not a list of directories: a module
// that becomes browser-reachable is audited the day the edge is added.
//
// In Core the entries are the Core modules the web extension's bundles enter
// through. They are not a guess: the extension's `pnpm check` bundles every
// browser entry and fails when the bundle enters Core through a module not
// listed there, so the list cannot fall behind the bundle.
//
// What fails, never ratcheted: a Node built-in (`node:crypto`, or the bare
// `crypto`); a third-party package not declared in `browserBundles.
// browserPackages`; and an import the walk cannot follow, because an audit
// that stops quietly at an edge it does not understand passes the very file
// behind it. `browserBundles.ownedElsewhere` names specifiers another
// repository's own copy of this rule holds.

import { walkBrowserGraph } from "../browser-graph/index.mjs";

export const id = "browser-imports";
export const title = "Modules a browser bundle loads import no Node built-in or Node-only package";

export function run(ctx) {
  const config = ctx.CONFIG.browserBundles;
  if (!config || config.entries.length === 0) return [];
  const { problems } = walkBrowserGraph(ctx, config);
  const seen = new Set();
  const findings = [];
  for (const problem of problems) {
    const key = `${problem.file}:${problem.line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const chain = problem.chain.map((file, index) => `${index === 0 ? "   " : "-> "}${file}`).join("\n    ");
    const where = problem.line > 0 ? `${problem.file}:${problem.line}` : problem.file;
    findings.push({
      key, value: 1, limit: 0, path: problem.file, ...(problem.line > 0 ? { line: problem.line } : {}),
      message: `${where}: ${problem.detail}. This module is loaded by ${config.consumer}, which cannot load Node-only code. Reached through:\n    ${chain}\n  Move the Node-only work out of the browser-reachable graph (a Node-side module the browser never imports), take the value from a browser-safe module, or make the import type-only.`,
      severity: "fail", ratchet: false
    });
  }
  return findings;
}
