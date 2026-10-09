// Where each part of an assembled plan was written, read once while the script
// is assembled (`./assemble.ts`), so any refusal after it can name the step.
//
// A script's steps do not become plan nodes one for one. An optional step is
// two nodes, a repeat adds Merges, a For Each or a Repeat, and a step that
// names no node becomes none at all, so a plan path's index names no step the
// model wrote (lane B, `run-mv0fu9pb-57454dc4` 0058: "node 10" was the step at
// line 32). This records, for every node, the written step it is -- or, for a
// node Core derived, the written step whose statement made it -- so the place
// is read from what was built, never re-derived from a count.
//
// **A derived node is the step that caused it.** Whatever lowers a statement
// into nodes marks each step it adds with `cause`, the written line of the
// statement (`./contracts.ts`). A derived step that carries none -- one a
// future statement adds without saying -- is still placed: at the nearest
// written step before it in its block, else the nearest after it, so no node a
// script assembles is ever without a place.
import type { AutomationStudioFlowBootstrapEdge } from "../plan/index.ts";
import type {
  AutomationStudioFlowBootstrapIssueLocator,
  AutomationStudioFlowScript,
  AutomationStudioFlowScriptBlock,
  AutomationStudioFlowScriptPlace,
  AutomationStudioFlowScriptStep
} from "./contracts.ts";

/** One Subflow the plan holds, in plan order, with the step each of its nodes was built from. */
export type AutomationStudioFlowScriptLocatedSubflow = {
  /** The script block it was built from (`AutomationStudioFlowScript.blocks`). */
  blockIndex: number;
  /** The step each node was built from, in node order: a written step's copy, or a derived step. */
  steps: readonly AutomationStudioFlowScriptStep[];
  nodeKeys: readonly string[];
  edges: readonly AutomationStudioFlowBootstrapEdge[];
};

/** The locator for a script and what was assembled from it. */
export function automationStudioFlowScriptLocator(input: {
  /** The script as the parser read it, before any statement was lowered into derived steps. */
  script: AutomationStudioFlowScript;
  subflows: readonly AutomationStudioFlowScriptLocatedSubflow[];
  /** Issues raised for a written step that became no node, by exact path. */
  unplaced: readonly { path: string; step: AutomationStudioFlowScriptStep }[];
  /** The block each router rule runs, in rule order. */
  rules: readonly number[];
  /** The block that runs when no rule holds. */
  fallback: number | undefined;
}): AutomationStudioFlowBootstrapIssueLocator {
  const byLine = new Map<number, AutomationStudioFlowScriptStep>();
  for (const block of input.script.blocks) for (const step of block.steps) if (step.line > 0) byLine.set(step.line, step);
  const written = (step: AutomationStudioFlowScriptStep): AutomationStudioFlowScriptPlace | undefined => {
    const line = step.line || step.cause;
    const found = line ? byLine.get(line) : undefined;
    return found ? stepPlace(found) : undefined;
  };
  const blockPlace = (index: number): AutomationStudioFlowScriptPlace | undefined => {
    const block = input.script.blocks[index];
    return block ? ownPlace(block) : undefined;
  };
  const locator: AutomationStudioFlowBootstrapIssueLocator = { paths: {}, nodes: {}, edges: {}, subflows: {}, rules: {}, lines: [] };
  for (const [subflowIndex, subflow] of input.subflows.entries()) {
    const places = subflow.steps.map(written);
    const fallback = blockPlace(subflow.blockIndex);
    const resolved = places.map((place, index) => place ?? nearest(places, index) ?? fallback);
    for (const [index, place] of resolved.entries()) if (place) locator.nodes[`${subflowIndex}.${index}`] = place;
    const indexOf = new Map(subflow.nodeKeys.map((key, index) => [key, index] as const));
    for (const [index, edge] of subflow.edges.entries()) {
      const place = resolved[indexOf.get(edge.source.nodeKey) ?? -1];
      if (place) locator.edges[`${subflowIndex}.${index}`] = place;
    }
    if (fallback) locator.subflows[String(subflowIndex)] = fallback;
  }
  for (const { path, step } of input.unplaced) {
    const place = written(step);
    if (place && !(path in locator.paths)) locator.paths[path] = place;
  }
  for (const [index, blockIndex] of input.rules.entries()) {
    const place = blockPlace(blockIndex);
    if (place) locator.rules[String(index)] = place;
  }
  const fallback = input.fallback === undefined ? undefined : blockPlace(input.fallback);
  if (fallback) locator.fallback = fallback;
  locator.lines = scriptLines(input.script);
  return locator;
}

/** Each written step by its first line, and each block's own lines exactly, in line order. */
function scriptLines(script: AutomationStudioFlowScript): AutomationStudioFlowBootstrapIssueLocator["lines"] {
  const lines: AutomationStudioFlowBootstrapIssueLocator["lines"] = [];
  for (const block of script.blocks) {
    for (const step of block.steps) if (step.line > 0) lines.push({ line: step.line, place: stepPlace(step) });
    // The steps outside every block have no line of their own; a `when:` among
    // them belongs to the step it is written in, which the step entries say.
    if (block.label === undefined) continue;
    const own = ownPlace(block);
    if (block.line > 0) lines.push({ line: block.line, place: own, exact: true });
    for (const condition of block.when ?? []) lines.push({ line: condition.line, place: { ...own, line: condition.line }, exact: true });
  }
  return lines.sort((a, b) => a.line - b.line);
}

/** A written step as the model wrote it. A label Core gave it (`:...`) is not the model's, and is left out. */
function stepPlace(step: AutomationStudioFlowScriptStep): AutomationStudioFlowScriptPlace {
  return {
    step: step.description,
    ...(step.label !== undefined && !step.label.startsWith(":") ? { label: step.label } : {}),
    line: step.line
  };
}

/** A block's own place: its name and label at its `subflow` line, or the first step of the steps outside every block. */
function ownPlace(block: AutomationStudioFlowScriptBlock): AutomationStudioFlowScriptPlace {
  if (block.label === undefined || block.line <= 0) {
    const first = block.steps.find((step) => step.line > 0);
    if (first) return stepPlace(first);
  }
  return { step: block.name, ...(block.label === undefined ? {} : { label: block.label }), ...(block.line > 0 ? { line: block.line } : {}) };
}

/** The nearest placed entry before `index`, else after it. */
function nearest(places: readonly (AutomationStudioFlowScriptPlace | undefined)[], index: number): AutomationStudioFlowScriptPlace | undefined {
  for (let before = index - 1; before >= 0; before -= 1) if (places[before]) return places[before];
  for (let after = index + 1; after < places.length; after += 1) if (places[after]) return places[after];
  return undefined;
}
