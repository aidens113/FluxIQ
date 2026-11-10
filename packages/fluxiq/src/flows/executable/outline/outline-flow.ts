// A stored Flow graph as a plain numbered list of steps (FluxNode plan P9, the
// editor; `docs/working/fluxnode-plan/reports/panel-design.md`, section 3).
//
// The outline is a view, never a second copy: every node of the graph is in
// exactly one step, structural nodes attributed to the step that stands for
// them, and nothing the graph does is hidden. A part that does not nest -- a
// jump back that is not a loop, a second way in, a node the start never
// reaches -- is shown as it is, with the issue that it is clearer in the graph.
// The words are plain English, never node type ids, and nothing here calls a
// model.
import type { ExecutableGraph } from "../graph/index.ts";
import type { AutomationStudioFlowInterface } from "../interface/index.ts";
import { outlinePathGraph } from "./graph/index.ts";
import type { FlowOutline, FlowOutlineOptions, OutlineIssue, OutlineStep } from "./types/index.ts";
import {
  outlineAttachFeeders,
  outlineEntries,
  outlineFlatSteps,
  outlineHandlerSection,
  outlineNextUnplaced,
  outlineNumber,
  outlineRouterStep,
  outlineSequence,
  outlineWordJumps,
  type OutlineBlock,
  type OutlineWalk
} from "./walk/index.ts";
import { outlineInterfaceOf } from "./words/index.ts";

/** The graph's outline; `options` supplies what is stored beside the graph and the domain's words. */
export function outlineFlow(graph: Pick<ExecutableGraph, "nodes" | "edges"> & { interface?: AutomationStudioFlowInterface }, options: FlowOutlineOptions = {}): FlowOutline {
  const flowInterface = options.interface ?? graph.interface;
  const walk: OutlineWalk = {
    graph,
    nodes: new Map(graph.nodes.map((node) => [node.id, node])),
    paths: outlinePathGraph(graph),
    options,
    outputs: (flowInterface?.outputs ?? []).map((port) => port.name || port.id),
    visited: new Set(),
    jumps: []
  };
  const issues: OutlineIssue[] = [];
  const steps: OutlineStep[] = [];
  const router = outlineRouterStep(options);
  if (router) steps.push(router);
  const [main, ...others] = outlineEntries(walk);
  if (main !== undefined) steps.push(...stepsOf(outlineSequence(walk, main, new Map(), true), "Nothing to do yet"));
  if (others.length) issues.push({ code: "several-entries", words: "This Flow starts in more than one place. This part is clearer in the graph", nodeIds: others });
  const handlers = outlineHandlerSection(walk);
  outlineAttachFeeders(walk, handlers ? [...steps, handlers] : steps);
  const unreached: OutlineStep[] = [];
  for (let from = outlineNextUnplaced(walk); from !== undefined; from = outlineNextUnplaced(walk)) {
    unreached.push(...stepsOf(outlineSequence(walk, from, new Map(), true), "Nothing to do here"));
    outlineAttachFeeders(walk, [...steps, ...unreached, ...(handlers ? [handlers] : [])]);
  }
  if (unreached.length) {
    steps.push({ number: "", nodeIds: [], kind: "section", words: "These steps do not run from the start:", lasting: [], children: unreached });
    issues.push({ code: "unreached", words: "Some steps do not run from the start. This part is clearer in the graph", nodeIds: outlineFlatSteps(unreached).flatMap((step) => step.nodeIds) });
  }
  if (handlers) steps.push(handlers);
  outlineNumber(steps);
  issues.push(...outlineWordJumps(walk, steps));
  return { interface: outlineInterfaceOf(flowInterface), steps, issues };
}

/** A block's steps; a block of hidden nodes alone becomes one step holding them, so none goes missing. */
function stepsOf(block: OutlineBlock, words: string): OutlineStep[] {
  if (!block.hidden.length) return block.steps;
  return [...block.steps, { number: "", nodeIds: block.hidden, kind: "empty", words, lasting: [] }];
}
