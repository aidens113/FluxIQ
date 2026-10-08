// The evaluation-order graph of every audited script: an edge from a module to
// each source file one of its runtime specifiers (runtime-specifiers.mjs)
// resolves to, barrels included -- a barrel is a module like any other, and the
// usual way into a cycle.
//
// Specifiers resolve as browser-graph/resolve.mjs resolves them: relative ones
// to the source file they were compiled from, and this repository's workspace
// packages through their `exports` into source. A package owned elsewhere, a
// Node built-in or a stylesheet is not a module of this repository, so it is
// not an edge; another repository's own audit holds its graph.

import { resolveSpecifier, workspacePackages } from "../browser-graph/index.mjs";
import { runtimeSpecifiers } from "./runtime-specifiers.mjs";

// One audit run builds the graph once, however many rules read it.
const built = new WeakMap();

/**
 * @param {{ files: string[], scriptFiles: string[], read: (file: string) => string, ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @returns {Map<string, { target: string, line: number, text: string }[]>} each script's edges, one per target, in source order
 */
export function buildRuntimeGraph(ctx) {
  if (!built.has(ctx)) built.set(ctx, build(ctx));
  return built.get(ctx);
}

function build(ctx) {
  const graph = { fileSet: new Set(ctx.files), packages: workspacePackages(ctx), config: {} };
  const edges = new Map();
  for (const file of ctx.scriptFiles) {
    const out = [];
    const seen = new Set();
    for (const { text, line } of runtimeSpecifiers(ctx, file)) {
      const resolution = resolveSpecifier(graph, file, text);
      if (resolution.kind !== "file" || seen.has(resolution.file)) continue;
      seen.add(resolution.file);
      out.push({ target: resolution.file, line, text });
    }
    edges.set(file, out);
  }
  return edges;
}
