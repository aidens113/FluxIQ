// The saved graphs Core assembles from its Flow script format's state-aware
// worked examples (t388), as `worked-example-graphs.json` holds them: a Flow
// that starts where the page already is, an interruption handled for the whole
// automation, a second known way as a failure handler, and a handler that
// returns to a checkpoint. Test support for the handler views.

import { readFileSync } from "node:fs";

export type WorkedExampleGraph = { role: string; name: string; flow: any };

const examples: Record<string, WorkedExampleGraph[]> = JSON.parse(readFileSync(new URL("./worked-example-graphs.json", import.meta.url), "utf8")).examples;

export const WORKED_EXAMPLE = {
  entry: "Example, starting where the page already is:",
  interruption: "Example, an interruption that can come at any pass:",
  alternative: "Example, a second known way, checked the same:",
  checkpoint: "Example, a checkpoint a handler returns to:"
} as const;

/** One graph of a worked example: its main part by default, or the part with that role. */
export function workedExampleGraph(example: string, role = "primary"): WorkedExampleGraph {
  const graph = examples[example]?.find((entry) => entry.role === role);
  if (!graph) throw new Error(`No ${role} graph in ${example}`);
  return JSON.parse(JSON.stringify(graph)) as WorkedExampleGraph;
}

/** A node's id by the key the script assembler gave it (`s2`, `h1-s1`). */
export function workedExampleNodeId(graph: WorkedExampleGraph, key: string): string {
  const node = graph.flow.nodes.find((candidate: any) => candidate.metadata?.bootstrapSymbolicKey === key);
  if (!node) throw new Error(`No node ${key} in ${graph.flow.flowId}`);
  return node.id;
}
