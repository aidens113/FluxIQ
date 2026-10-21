// What one module can get at through its imports, followed binding by binding
// rather than module by module, and the shortest chain to the first module a
// predicate accepts.
//
// Why bindings. The evaluation-order graph (runtime-graph.mjs) says a module
// loads every file a barrel re-exports, which is right for module cycles and
// useless for asking what code a module can call: through the package's
// barrels nearly every module loads nearly every other. Here an import of
// `{ a }` from a barrel leads to the module that declares `a`, through the
// re-exports that carry it, and the hops it passes through count as reached
// too. From a module reached for one of its bindings, every value import it
// makes is followed, since that binding's code may use any of them. A
// namespace import, a literal dynamic `import()` or `export * as` reaches the
// whole module, its re-exports included. Type-only imports and elements are
// not followed: a type carries no value.
//
// Specifiers resolve as browser-graph/resolve.mjs resolves them; a package
// owned elsewhere, a Node built-in or a stylesheet is not followed.

import { resolveSpecifier, workspacePackages } from "../browser-graph/index.mjs";
import { moduleBindings } from "./module-bindings.mjs";

const stateFor = new WeakMap();

/**
 * @param {{ files: string[], read: (file: string) => string, ts: typeof import("typescript"), parse: (file: string) => import("typescript").SourceFile }} ctx
 * @param {string} start the module whose reach is walked: all of it, its imports and its re-exports
 * @param {(file: string) => boolean} isTarget
 * @returns {string[] | null} the files from `start` to the first accepted one, re-exporting hops included; null when none is reached
 */
export function bindingChain(ctx, start, isTarget) {
  const state = stateOf(ctx);
  const startKey = `${start}|whole`;
  const previous = new Map([[startKey, null]]);
  const queue = [{ file: start, whole: true }];
  for (let head = 0; head < queue.length; head += 1) {
    const node = queue[head];
    const key = `${node.file}|${node.whole ? "whole" : "own"}`;
    for (const step of edgesOf(state, node)) {
      const stepKey = `${step.file}|${step.whole ? "whole" : "own"}`;
      const hit = [...step.via, step.file].findIndex(isTarget);
      if (hit >= 0) return [...chainBack(previous, key), ...[...step.via, step.file].slice(0, hit + 1)];
      if (previous.has(stepKey) || (!step.whole && previous.has(`${step.file}|whole`))) continue;
      previous.set(stepKey, { key, via: step.via });
      queue.push(step);
    }
  }
  return null;
}

function chainBack(previous, key) {
  const chain = [];
  for (let current = key; current !== null; ) {
    chain.unshift(current.slice(0, current.lastIndexOf("|")));
    const entry = previous.get(current);
    if (entry === null) break;
    chain.unshift(...entry.via);
    current = entry.key;
  }
  return chain;
}

function stateOf(ctx) {
  if (!stateFor.has(ctx)) {
    stateFor.set(ctx, {
      ctx,
      graph: { fileSet: new Set(ctx.files), packages: workspacePackages(ctx), config: {} },
      bindings: new Map(),
      edges: new Map()
    });
  }
  return stateFor.get(ctx);
}

function bindingsOf(state, file) {
  if (!state.bindings.has(file)) state.bindings.set(file, moduleBindings(state.ctx, file));
  return state.bindings.get(file);
}

function target(state, from, text) {
  const resolution = resolveSpecifier(state.graph, from, text);
  return resolution.kind === "file" ? resolution.file : null;
}

// Where `name`, exported by `file`, is declared: the declaring module (or the
// whole module, for a namespace) and the re-exporting files passed on the way.
// Null when `file` does not export it.
function resolveBinding(state, file, name, seen = new Set()) {
  const key = `${file}#${name}`;
  if (seen.has(key)) return null;
  seen.add(key);
  const bindings = bindingsOf(state, file);
  if (bindings.local.has(name)) return { file, whole: false, via: [] };
  const forwarded = bindings.importedExports.get(name) ?? bindings.reexports.get(name);
  if (forwarded) {
    const next = target(state, file, forwarded.text);
    if (next === null) return { file, whole: false, via: [] };
    if (forwarded.name === null) return { file: next, whole: true, via: [file] };
    const found = resolveBinding(state, next, forwarded.name, seen);
    return found ? { ...found, via: [file, ...found.via] } : { file: next, whole: true, via: [file] };
  }
  for (const star of bindings.stars) {
    const next = target(state, file, star.text);
    if (next === null) continue;
    const found = resolveBinding(state, next, name, seen);
    if (found) return { ...found, via: [file, ...found.via] };
  }
  return null;
}

function edgesOf(state, node) {
  const key = `${node.file}|${node.whole ? "whole" : "own"}`;
  if (state.edges.has(key)) return state.edges.get(key);
  const bindings = bindingsOf(state, node.file);
  const steps = [];
  const towards = (next, name) => resolveBinding(state, next, name) ?? { file: next, whole: true, via: [] };

  for (const entry of bindings.imports) {
    const next = target(state, node.file, entry.text);
    if (next === null) continue;
    if (entry.whole) steps.push({ file: next, whole: true, via: [] });
    else if (entry.effect) steps.push({ file: next, whole: false, via: [] });
    for (const name of entry.names) steps.push(towards(next, name));
  }
  if (node.whole) {
    for (const entry of [...bindings.reexports.values()]) {
      const next = target(state, node.file, entry.text);
      if (next !== null) steps.push(entry.name === null ? { file: next, whole: true, via: [] } : towards(next, entry.name));
    }
    for (const star of bindings.stars) {
      const next = target(state, node.file, star.text);
      if (next !== null) steps.push({ file: next, whole: true, via: [] });
    }
  }

  state.edges.set(key, steps);
  return steps;
}
