// A step found by its number: the block it sits in, its place there, and the
// node it stands for.
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import type { OutlineStep } from "../types/index.ts";
import type { OutlineEditContext } from "./edit-context.ts";

/** A step, the steps of its block in order, its index there, and its node when it stands for one. */
export type OutlineStepPlace = { step: OutlineStep; block: readonly OutlineStep[]; index: number; node?: AutomationStudioFlowNode };

/** Steps that stand for no node of their own. */
const NODELESS: ReadonlySet<OutlineStep["kind"]> = new Set(["jump", "handlers", "section", "router", "empty"]);

/** The step numbered `number`, or nothing when the outline has none. */
export function outlineStepPlace(context: OutlineEditContext, number: string): OutlineStepPlace | undefined {
  return search(context, topBlocks(context.outline.steps), number);
}

function search(context: OutlineEditContext, blocks: readonly (readonly OutlineStep[])[], number: string): OutlineStepPlace | undefined {
  for (const block of blocks) {
    for (const [index, step] of block.entries()) {
      if (step.number === number && step.number !== "") {
        const node = NODELESS.has(step.kind) ? undefined : context.nodes.get(step.nodeIds[0] ?? "");
        return { step, block, index, ...(node ? { node } : {}) };
      }
      const inner = search(context, [step.children ?? [], ...(step.arms ?? []).map((arm) => arm.steps)], number);
      if (inner) return inner;
    }
  }
  return undefined;
}

/** The top-level steps as blocks: a heading's steps are a block of their own. */
function topBlocks(steps: readonly OutlineStep[]): OutlineStep[][] {
  const blocks: OutlineStep[][] = [[]];
  for (const step of steps) {
    if (step.kind === "handlers" || step.kind === "section") blocks.push([...(step.children ?? [])]);
    else blocks[0]!.push(step);
  }
  return blocks;
}
