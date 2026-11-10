// The words of each step the graph does not nest (rule 8), once every step has
// its number: "Go back to step 3" to a step before it, "Go to step 7" to one
// after, "Finish here" to the Flow's hidden end. Each one also raises the
// issue that the part is clearer in the graph.
import { outlineNodeRole } from "../graph/index.ts";
import type { OutlineIssue, OutlineStep } from "../types/index.ts";
import { outlineFlatSteps } from "./flat-steps.ts";
import type { OutlineWalk } from "./walk.ts";

/** Words every jump step and returns the issues they raise. */
export function outlineWordJumps(walk: OutlineWalk, steps: readonly OutlineStep[]): OutlineIssue[] {
  const flat = outlineFlatSteps(steps);
  const owner = new Map<string, OutlineStep>();
  for (const step of flat) for (const id of step.nodeIds) owner.set(id, step);
  return walk.jumps.map((jump): OutlineIssue => {
    const target = landing(walk, jump.jumpTo ?? "");
    const step = owner.get(target);
    const node = walk.nodes.get(target);
    const hiddenEnd = node !== undefined && outlineNodeRole(node) === "end" && step?.nodeIds[0] !== target;
    if (!step || hiddenEnd) jump.words = "Finish here";
    else jump.words = flat.indexOf(step) <= flat.indexOf(jump) ? `Go back to step ${step.number}` : `Go to step ${step.number}`;
    return { code: "unstructured", words: "This part is clearer in the graph", step: jump.number, nodeIds: [jump.jumpTo ?? target] };
  });
}

/** Where going to a node lands: past the hidden start, merge and noop nodes in front of the next step. */
function landing(walk: OutlineWalk, nodeId: string): string {
  const seen = new Set<string>();
  let at = nodeId;
  for (;;) {
    const node = walk.nodes.get(at);
    const next = [...new Set((walk.paths.out.get(at) ?? []).map((edge) => edge.target))];
    const role = node ? outlineNodeRole(node) : undefined;
    if (seen.has(at) || next.length !== 1 || (role !== "start" && role !== "merge" && role !== "noop")) return at;
    seen.add(at);
    at = next[0]!;
  }
}
