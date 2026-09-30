// Every module a browser bundle loads, walked from the bundle's entries over
// the value imports that survive compilation, and what each one reaches that a
// browser cannot load.
//
// The first file to import a module is recorded as its parent, so a refusal
// can print the chain from the entry, which is what a developer needs: the
// module holding the Node import is rarely the one whose import has to change.

import { resolveSpecifier, workspacePackages } from "./resolve.mjs";
import { valueSpecifiers } from "./specifiers.mjs";

/**
 * @typedef {{ file: string, line: number, specifier: string, chain: string[], problem: "builtin" | "undeclared-package" | "unresolved" | "missing-entry", detail: string }} BrowserProblem
 */

/**
 * @param {object} ctx the structure-audit context (files, read, parse, ts)
 * @param {{ entries: string[], ownedElsewhere?: { pattern: RegExp }[], browserPackages?: string[] }} config
 * @returns {{ reached: string[], problems: BrowserProblem[] }}
 */
export function walkBrowserGraph(ctx, config) {
  const fileSet = new Set(ctx.files);
  const graph = { fileSet, packages: workspacePackages(ctx), config };
  /** @type {Map<string, string | null>} */
  const parent = new Map();
  const queue = [];
  const problems = [];

  for (const entry of config.entries) {
    if (!fileSet.has(entry)) {
      problems.push({ file: entry, line: 0, specifier: "", chain: [entry], problem: "missing-entry", detail: `the browser entry ${entry} is not an audited file; the configured entries no longer match the bundle` });
      continue;
    }
    if (!parent.has(entry)) {
      parent.set(entry, null);
      queue.push(entry);
    }
  }

  for (let index = 0; index < queue.length; index += 1) {
    const file = queue[index];
    for (const { text, line } of valueSpecifiers(ctx, file)) {
      const resolution = resolveSpecifier(graph, file, text);
      if (resolution.kind === "file") {
        if (!parent.has(resolution.file)) {
          parent.set(resolution.file, file);
          queue.push(resolution.file);
        }
        continue;
      }
      const detail = resolution.kind === "builtin"
        ? `imports the Node built-in "${resolution.name}"`
        : resolution.kind === "undeclared-package"
          ? `imports the package "${resolution.name}", which is not declared browser-safe (browserBundles.browserPackages) and is treated as Node-only`
          : resolution.kind === "unresolved" ? `cannot be followed: ${resolution.why}` : null;
      if (detail === null) continue;
      problems.push({ file, line, specifier: text, chain: chainTo(parent, file), problem: resolution.kind, detail });
    }
  }

  return { reached: queue, problems };
}

function chainTo(parent, file) {
  const chain = [];
  for (let current = file; current !== null && current !== undefined; current = parent.get(current)) chain.unshift(current);
  return chain;
}
