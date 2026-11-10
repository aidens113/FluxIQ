// The step one visible node becomes, before its blocks and arms are filled in.
import type { AutomationStudioFlowNode } from "../../graph/index.ts";
import { outlineCallLinkOf, type OutlineNodeRole } from "../graph/index.ts";
import type { OutlineStep } from "../types/index.ts";
import { outlineActWords, outlineCallWords, outlineControlWords, outlineDataWords, outlineHandlerWords, outlinePartStepOf } from "../words/index.ts";
import type { OutlineWalk } from "./walk.ts";

/** The ports a control node is given the value it tests or walks on. */
const FED_PORTS: ReadonlySet<string> = new Set(["condition", "items", "value"]);

/** The node's step, numbered later; `nodeIds` holds the node alone until the walk adds what it stands for. */
export function outlineStepOf(walk: OutlineWalk, node: AutomationStudioFlowNode, role: OutlineNodeRole): OutlineStep {
  const step = (kind: OutlineStep["kind"], words: string, lasting: OutlineStep["lasting"] = []): OutlineStep => ({ number: "", nodeIds: [node.id], kind, words, lasting });
  switch (role) {
    case "act": {
      const said = outlineActWords(node, walk.options.describeOutput);
      return step("act", said.words, said.lasting);
    }
    case "call": {
      const link = outlineCallLinkOf(node);
      const said = outlineCallWords(node, link, walk.options.describeFlow);
      return { ...step("call", said.words, said.lasting), ...(link ? { link } : {}) };
    }
    case "data": {
      const part = outlinePartStepOf(node);
      return step("data", outlineDataWords(node) ?? part.said.label, part.said.lastingClasses);
    }
    case "branch":
    case "switch":
    case "loop":
      return step(role, outlineControlWords(node, fedBy(walk, node.id)));
    case "handler":
      return step("handler", outlineHandlerWords(node, "heading"));
    case "handler-end":
      return step("handler-end", outlineHandlerWords(node, "ending"));
    case "start":
    case "merge":
    case "noop":
      return step("step", "Go on along each of these paths:");
    default: {
      const part = outlinePartStepOf(node);
      return step("step", part.said.label, part.said.lastingClasses);
    }
  }
}

/** The node a value edge brings a control node its value from. */
function fedBy(walk: OutlineWalk, nodeId: string): AutomationStudioFlowNode | undefined {
  const edge = walk.paths.values.find((candidate) => candidate.targetNodeId === nodeId && FED_PORTS.has(candidate.targetPortId ?? ""));
  return edge ? walk.nodes.get(edge.sourceNodeId) : undefined;
}
