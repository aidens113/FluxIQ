// Random graphs for the outline's property test: any mix of node kinds, and
// edges by any port to any node -- loops, jumps, self edges, duplicates, value
// edges, edges to nodes that do not exist -- from a seed, so a failure repeats.
import type { AutomationStudioFlowEdge, AutomationStudioFlowNode } from "../../graph/index.ts";
import type { FixtureGraph } from "./graph-fixture.ts";

const DEFINITIONS = [
  "builtin.control.start",
  "builtin.control.end",
  "builtin.control.merge",
  "builtin.control.noop",
  "builtin.control.branch",
  "builtin.control.switch",
  "builtin.control.for-each",
  "builtin.control.loop",
  "builtin.control.repeat",
  "builtin.control.handler",
  "builtin.control.handler-end",
  "builtin.control.call-subflow",
  "builtin.control.call-flow",
  "builtin.policy.action",
  "builtin.data.constant",
  "builtin.data.pipeline-step",
  "builtin.logic.compare",
  "web.output.dom-click"
];

const SOURCE_PORTS = [undefined, undefined, "success", "failed", "true", "false", "body", "done", "case", "default", "next", "item", "value", "records", "error.timeout"];
const TARGET_PORTS = [undefined, undefined, undefined, "in", "condition", "items", "right"];

/** A deterministic generator of numbers in [0, 1). */
export function seeded(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

/** One random graph of 1 to 14 nodes. */
export function randomGraph(seed: number): FixtureGraph {
  const random = seeded(seed);
  const pick = <T>(items: readonly T[]): T => items[Math.floor(random() * items.length)]!;
  const count = 1 + Math.floor(random() * 14);
  const nodes: AutomationStudioFlowNode[] = Array.from({ length: count }, (_, index) => ({
    id: `n${index}`,
    definitionId: pick(DEFINITIONS),
    ...(random() < 0.5 ? { label: pick(["Press the button", "s3 dom-click", "Read the list", ""]) } : {})
  }));
  const edges: AutomationStudioFlowEdge[] = [];
  const edgeCount = Math.floor(random() * count * 2.5);
  for (let index = 0; index < edgeCount; index += 1) {
    const sourcePortId = pick(SOURCE_PORTS);
    const targetPortId = pick(TARGET_PORTS);
    const target = random() < 0.03 ? "missing" : `n${Math.floor(random() * count)}`;
    edges.push({
      id: `e${index}`,
      sourceNodeId: `n${Math.floor(random() * count)}`,
      targetNodeId: target,
      ...(sourcePortId ? { sourcePortId } : {}),
      ...(targetPortId ? { targetPortId } : {})
    });
  }
  return { flowId: `random-${seed}`, nodes, edges, ...(random() < 0.3 ? { interface: { inputs: [], outputs: [{ id: "rows", name: "rows", valueType: { kind: "json" } }] } } : {}) };
}
