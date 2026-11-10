// Handler regions as the closing "If something goes wrong:" section (rule 5).
// A handler is a registration no path enters; its `body` port leads to the
// steps it runs, ending at a Handler End. They are listed in the order the
// dispatcher runs them: lower `order` first, ties in graph order.
import type { JsonValue } from "../../../../core/index.ts";
import { outlineNodeRole } from "../graph/index.ts";
import type { OutlineStep } from "../types/index.ts";
import { outlineSequence } from "./sequence.ts";
import { outlineStepOf } from "./step-of.ts";
import type { OutlineWalk } from "./walk.ts";

/** The section of every handler not yet placed, or nothing when there is none. */
export function outlineHandlerSection(walk: OutlineWalk): OutlineStep | undefined {
  const handlers = walk.graph.nodes
    .map((node, index) => ({ node, index, order: orderOf(node.parameterValues?.order) }))
    .filter(({ node }) => outlineNodeRole(node) === "handler" && !walk.visited.has(node.id))
    .sort((a, b) => a.order - b.order || a.index - b.index);
  if (!handlers.length) return undefined;
  const children: OutlineStep[] = [];
  for (const { node } of handlers) {
    // A handler body may run into another handler, which is then placed there.
    if (walk.visited.has(node.id)) continue;
    walk.visited.add(node.id);
    const step = outlineStepOf(walk, node, "handler");
    children.push(step);
    const body = (walk.paths.out.get(node.id) ?? []).find((edge) => edge.port === "body");
    if (!body) continue;
    const block = outlineSequence(walk, body.target, new Map([[node.id, "jump"]]), false);
    step.children = block.steps;
    step.nodeIds.push(...block.hidden);
  }
  return { number: "", nodeIds: [], kind: "handlers", words: "If something goes wrong:", lasting: [], children };
}

function orderOf(order: JsonValue | undefined): number {
  return typeof order === "number" ? order : 0;
}
