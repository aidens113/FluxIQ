// The walk that turns a stretch of the path into a block of steps.
//
// A block runs from one node until it reaches its natural end: the join its
// paths meet at, the head of the loop it is the body of, or a node with no way
// on. A node already placed, or the natural end of an enclosing block reached
// from inside a nested one, is never walked again or hidden: it becomes a
// "Go to step N" step (rule 8). Every node the walk passes is visited once and
// put in exactly one step: start, merge and noop are attached to the step
// after them (or, closing a split, to the split itself), and a hidden end to
// the step before it.
//
// A step with more than one way on nests them (rule 2): the ways meet at their
// nearest common post-dominator, each way is a block ending there, and the
// walk carries on from it. Where they never meet, each way runs to its own
// end and the block ends with the step. A loop's body is the block of its
// `body` port, ending back at the loop (rule 3); its `done` port carries on.
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineJoinOf, outlineNodeRole, type OutlineNodeRole, type OutlinePathEdge } from "../graph/index.ts";
import type { OutlineStep } from "../types/index.ts";
import { outlineArmWords } from "../words/index.ts";
import { outlineStepOf } from "./step-of.ts";
import type { OutlineWalk } from "./walk.ts";

/** Where a block may end: silently (`natural`), or by a step that says where it goes (`jump`). */
export type OutlineEnds = ReadonlyMap<string, "natural" | "jump">;

/** A block's steps, and the hidden nodes it passed when it has no step to attach them to. */
export type OutlineBlock = { steps: OutlineStep[]; hidden: string[] };

const HIDDEN: ReadonlySet<OutlineNodeRole> = new Set(["start", "merge", "noop"]);
const FAILURE_PORTS: ReadonlySet<string> = new Set(["failed", "failure"]);

/** The block from `from` until one of its ends; `atTail` when nothing in the Flow follows it. */
export function outlineSequence(walk: OutlineWalk, from: string | undefined, ends: OutlineEnds, atTail: boolean): OutlineBlock {
  const steps: OutlineStep[] = [];
  let pending: string[] = [];
  const push = (step: OutlineStep): OutlineStep => {
    step.nodeIds.push(...pending);
    pending = [];
    steps.push(step);
    return step;
  };
  let at = from;
  while (at !== undefined) {
    const end = ends.get(at);
    if (end === "natural") break;
    if (end === "jump" || walk.visited.has(at)) {
      push(jumpStep(walk, at));
      break;
    }
    const node = walk.nodes.get(at);
    if (!node) break;
    walk.visited.add(at);
    const role = outlineNodeRole(node);
    const outs = walk.paths.out.get(at) ?? [];
    if (passesThrough(role, outs)) {
      pending.push(at);
      at = outs[0]?.target;
      continue;
    }
    if (role === "end") {
      const said = endStep(walk, node, atTail);
      if (said) push(said);
      else pending.push(at);
      break;
    }
    const step = push(outlineStepOf(walk, node, role));
    // A handler's body ends here; what the run does next is the dispatcher's.
    if (role === "handler-end") break;
    at = wayOn(walk, step, node, role, outs, ends, atTail);
  }
  if (!pending.length) return { steps, hidden: [] };
  const last = steps.at(-1);
  if (!last) return { steps, hidden: pending };
  last.nodeIds.push(...pending);
  return { steps, hidden: [] };
}

/** Fills in the step's body and arms, and answers where the block carries on, if it does. */
function wayOn(walk: OutlineWalk, step: OutlineStep, node: AutomationStudioFlowNode, role: OutlineNodeRole, outs: readonly OutlinePathEdge[], ends: OutlineEnds, atTail: boolean): string | undefined {
  let routes = outs;
  if (role === "loop") {
    const body = outs.find((edge) => edge.port === "body");
    routes = outs.filter((edge) => edge !== body);
    if (body) {
      const done = routes.find((edge) => edge.port === "done")?.target;
      const bodyEnds = jumping(ends);
      bodyEnds.set(node.id, "natural");
      if (done !== undefined && !bodyEnds.has(done)) bodyEnds.set(done, "jump");
      const block = outlineSequence(walk, body.target, bodyEnds, false);
      step.children = block.steps;
      step.nodeIds.push(...block.hidden);
    }
  }
  const ways = routes.filter((edge, index) => routes.findIndex((other) => other.target === edge.target) === index);
  const splits = role === "branch" || role === "switch";
  if (!ways.length) return undefined;
  if (ways.length === 1 && !splits) return ways[0]!.target;
  const join = outlineJoinOf(walk.paths, ways.map((edge) => edge.target), (id) => ends.has(id) || walk.visited.has(id));
  // A step that works goes on in the same block: where its other ways rejoin
  // it, or where they never do (each then runs to its own end, or jumps).
  const success = splits ? undefined : ways.find((edge) => !FAILURE_PORTS.has(edge.port) && !edge.port.startsWith("error."));
  const carryOn = join === undefined || success?.target === join ? success : undefined;
  const armEnds = join === undefined ? ends : jumping(ends).set(join, "natural");
  const childPort = node.parameterValues?.invert === true ? "false" : "true";
  // A second edge leaving by a port already shown is another wire on the same way out.
  const shownPorts = new Set(carryOn ? [carryOn.port] : []);
  for (const way of ways) {
    if (way === carryOn) continue;
    const again = shownPorts.has(way.port);
    shownPorts.add(way.port);
    const block = outlineSequence(walk, way.target, armEnds, join === undefined && carryOn === undefined && atTail);
    step.nodeIds.push(...block.hidden);
    const empty = block.steps.length === 0;
    if (role === "branch" && way.port === childPort && step.children === undefined) step.children = block.steps;
    else if (role === "branch" && empty) continue;
    else if (empty && FAILURE_PORTS.has(way.port) && !again) (step.arms ??= []).push({ words: "If that does not work, carry on", port: way.port, steps: [] });
    else (step.arms ??= []).push({ words: armWords(node, role, way.port, again), port: way.port, steps: block.steps });
  }
  if (join === undefined) return carryOn?.target;
  return closingMerge(walk, step, join, ends);
}

function armWords(node: AutomationStudioFlowNode, role: OutlineNodeRole, port: string, again: boolean): string {
  if (again) return "Also:";
  return role === "branch" && (port === "true" || port === "false") ? "Otherwise:" : outlineArmWords(node, port);
}

/** The join, or past it when it is a hidden merge that closes this split and so belongs to its step. */
function closingMerge(walk: OutlineWalk, step: OutlineStep, join: string, ends: OutlineEnds): string | undefined {
  const node = walk.nodes.get(join);
  const outs = walk.paths.out.get(join) ?? [];
  if (!node || ends.has(join) || walk.visited.has(join) || !passesThrough(outlineNodeRole(node), outs)) return join;
  walk.visited.add(join);
  step.nodeIds.push(join);
  return outs[0]?.target;
}

/** A start, merge or noop with at most one way on: structure, never a step of its own. */
function passesThrough(role: OutlineNodeRole, outs: readonly OutlinePathEdge[]): boolean {
  return HIDDEN.has(role) && new Set(outs.map((edge) => edge.target)).size <= 1;
}

/** An end in words, or nothing when it is hidden: the natural end of a Flow that gives nothing back. */
function endStep(walk: OutlineWalk, node: AutomationStudioFlowNode, atTail: boolean): OutlineStep | undefined {
  const step = (kind: OutlineStep["kind"], words: string): OutlineStep => ({ number: "", nodeIds: [node.id], kind, words, lasting: [] });
  const status = node.parameterValues?.resultStatus;
  if (status === "failed") return step("end", "Stop here: it did not work");
  if (walk.outputs.length) return step("give-back", `Give back ${walk.outputs.join(" and ")}`);
  if (status === "skipped") return step("end", "Stop here");
  return atTail ? undefined : step("end", "Finish here");
}

/** A step to a node the block cannot nest, worded once every step has its number. */
function jumpStep(walk: OutlineWalk, target: string): OutlineStep {
  const step: OutlineStep = { number: "", nodeIds: [], kind: "jump", words: "", lasting: [], jumpTo: target };
  walk.jumps.push(step);
  return step;
}

/** The enclosing block's ends, each now reached only by a jump. */
function jumping(ends: OutlineEnds): Map<string, "natural" | "jump"> {
  return new Map([...ends.keys()].map((id) => [id, "jump"]));
}
