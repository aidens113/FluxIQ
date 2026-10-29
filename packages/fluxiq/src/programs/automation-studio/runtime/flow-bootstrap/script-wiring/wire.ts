// The edges a script's written order implies, and the ones its branches name.
//
// Steps connect in the order written, on the node's first output port no
// branch claimed, into the target's first free input port; an `on <port>: go to
// <label>` line claims a port and sends it to a named step instead
// (`../authoring/assemble.ts`). A wrong edge is a Flow that does the wrong
// thing quietly, so a branch that names nothing, or a port the node lacks, is
// refused with what was accepted named.
import type { AutomationNodePort, AutomationStudioNodeDefinition } from "../../../nodes/index.ts";
import type { AutomationStudioFlowBootstrapEdge, AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapNode } from "../plan/index.ts";
import type { AutomationStudioFlowScriptStep } from "../authoring/index.ts";
import { authoringError } from "../authoring/issue.ts";
import { matchAuthoringPort } from "../authoring/matching.ts";

/** The edges the written order implies, and the ones the branches name. */
export function automationStudioFlowScriptWire(input: {
  steps: readonly AutomationStudioFlowScriptStep[];
  nodes: readonly AutomationStudioFlowBootstrapNode[];
  definitionByKey: ReadonlyMap<string, AutomationStudioNodeDefinition>;
  keyByLabel: ReadonlyMap<string, string>;
  stepLabels: ReadonlyMap<string, number>;
  blockIndex: number;
  issues: AutomationStudioFlowBootstrapIssue[];
  keyPrefix: string;
}): AutomationStudioFlowBootstrapEdge[] {
  const edges: AutomationStudioFlowBootstrapEdge[] = [];
  const claimed = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const used = new Map<string, Set<string>>(input.nodes.map((node) => [node.key, new Set<string>()]));
  const branches: Array<{ sourceKey: string; port: AutomationNodePort; targetKey: string; targetPortId?: string }> = [];
  for (const [index, step] of input.steps.entries()) {
    const sourceKey = input.nodes[index]?.key;
    const definition = sourceKey ? input.definitionByKey.get(sourceKey) : undefined;
    if (!sourceKey || !definition) continue;
    for (const branch of step.branches) {
      const port = matchAuthoringPort(branch.port, definition.outputs);
      if (!port) {
        input.issues.push(authoringError("flow_script.unknown_port", `The branch at line ${branch.line} names the port "${branch.port}"; this node declares ${definition.outputs.map((candidate) => candidate.id).join(", ") || "no output port"}.`, `flow.line.${branch.line}`));
        continue;
      }
      const targetKey = input.keyByLabel.get(branch.target);
      if (!targetKey) {
        const elsewhere = input.stepLabels.has(branch.target) && input.stepLabels.get(branch.target) !== input.blockIndex;
        input.issues.push(authoringError(elsewhere ? "flow_script.branch_across_blocks" : "flow_script.unknown_label", elsewhere
          ? `The branch at line ${branch.line} goes to "${branch.target}", which is in another block; a branch stays inside its own block.`
          : `The branch at line ${branch.line} goes to "${branch.target}", which labels no step.`, `flow.line.${branch.line}`));
        continue;
      }
      claimed.get(sourceKey)!.add(port.id);
      branches.push({ sourceKey, port, targetKey, ...(branch.targetPort ? { targetPortId: branch.targetPort } : {}) });
    }
  }
  // A branch to the step written next takes that step's one way in. When the
  // source still has a port no branch claimed, that is the port it falls
  // through on, and the fall-through would have nowhere to go: the run would
  // stop there -- which is what a live build's "close it if it is showing;
  // on failed: go to the next step" did on 2026-09-18. Branching every port
  // of a step is fine; leaving one to fall into a taken step is refused.
  //
  // Two steps are not that mistake and are skipped. A `routed` step has no
  // fall-through to strand, because the code that wrote it wrote every edge
  // out of it. And a target that joins paths -- an input port declaring
  // `multiple` -- has more than one way in by construction, which is how a
  // branch and the path it left rejoin (`./assemble-draft.ts`).
  for (const branch of branches) {
    const index = input.nodes.findIndex((node) => node.key === branch.sourceKey);
    if (branch.targetKey !== input.nodes[index + 1]?.key) continue;
    if (input.steps[index]?.routed || joins(branch.targetKey, input.definitionByKey)) continue;
    const outputs = input.definitionByKey.get(branch.sourceKey)?.outputs ?? [];
    if (!outputs.some((port) => !claimed.get(branch.sourceKey)!.has(port.id))) continue;
    const line = input.steps[index]?.branches.find((written) => input.keyByLabel.get(written.target) === branch.targetKey)?.line ?? input.steps[index]?.line ?? 0;
    input.issues.push(authoringError("flow_script.branch_to_next_step", `The branch at line ${line} goes to the step written next, which the step already falls into; a step takes one way in, so the run would stop after this step. To do different things in different situations the run can start in, give each situation a \`subflow <label>:\` block with a \`when:\` line.`, `flow.line.${line}`));
  }
  for (const branch of branches) {
    const target = targetPort(branch.targetKey, input.definitionByKey, used, branch.targetPortId);
    if (!target) continue;
    edges.push(edge(`${input.keyPrefix}e${edges.length + 1}`, branch.sourceKey, branch.port.id, branch.targetKey, target));
  }
  for (const [index, node] of input.nodes.entries()) {
    const next = input.nodes[index + 1];
    if (!next) break;
    // A step that wrote all its own edges does not also fall into the next one.
    if (input.steps[index]?.routed) continue;
    const definition = input.definitionByKey.get(node.key);
    const source = definition?.outputs.find((port) => !claimed.get(node.key)!.has(port.id));
    const target = targetPort(next.key, input.definitionByKey, used);
    if (!source || !target) continue;
    claimed.get(node.key)!.add(source.id);
    edges.push(edge(`${input.keyPrefix}e${edges.length + 1}`, node.key, source.id, next.key, target));
  }
  return edges;
}

/** Whether a node declares a way in that several paths may arrive at. */
function joins(key: string, definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>): boolean {
  return (definitions.get(key)?.inputs ?? []).some((port) => port.multiple === true);
}

/**
 * Which of a target's input ports an edge arrives at: the one asked for, or
 * the first still free.
 *
 * A named port is taken as written and still marked used, so two edges naming
 * the same single-connection port are caught by validation rather than
 * silently redirected to another port that happened to be free.
 *
 * A port that declares `role: "data"` is reached only by name. It carries a
 * value, not the path -- a loop's current row, say -- and an edge that fell
 * into it because the control input was already taken would hand the node
 * a success signal where it expects a row, and leave the node with no way in.
 */
function targetPort(key: string, definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>, used: Map<string, Set<string>>, asked?: string): string | undefined {
  const inputs = definitions.get(key)?.inputs ?? [];
  const taken = used.get(key) ?? new Set<string>();
  const port = asked
    ? inputs.find((candidate) => candidate.id === asked)
    : inputs.find((candidate) => candidate.role !== "data" && (candidate.multiple === true || !taken.has(candidate.id)));
  if (!port) return undefined;
  taken.add(port.id);
  used.set(key, taken);
  return port.id;
}

function edge(key: string, sourceKey: string, sourcePort: string, targetKey: string, targetPortId: string): AutomationStudioFlowBootstrapEdge {
  return {
    key,
    source: { nodeKey: sourceKey, portId: sourcePort },
    target: { nodeKey: targetKey, portId: targetPortId }
  };
}
