// The unit an in-run repair is asked to fix, and its contract, as the model is
// shown it (state-aware recovery plan, C6 step 8, C12): the smallest unit the
// true failure names, and what that unit promised.
//
// - A node: its definition, what it is called, its parameters through the same
//   screen the repair context's `step_parameters` uses, and where each of its
//   ports leads.
// - A handler: its registration as the dispatcher reads it (event, scope,
//   `when`, completion check, order), and the definitions its body runs.
// - A part (a called Subflow): its interface, its success check, and its
//   entries and checkpoints.
//
// Authored data only, never a value the run resolved. Conditions are screened
// as authored state is, and the whole contract goes through the locator
// screen, so a contract carries no more than the repair context beside it.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowDocument, AutomationStudioFlowNode } from "../../../model/index.ts";
import { automationStudioGraphHandlerRegistrations, automationStudioSubflowContract } from "../../executor/lifecycle/index.ts";
import type { AutomationStudioRepairUnit } from "../../executor/lifecycle-run/index.ts";
import {
  automationStudioWithoutLocators,
  type AutomationStudioLlmInRunRepairContract,
  type AutomationStudioLlmInRunRepairPort,
  type AutomationStudioLlmInRunRepairStep
} from "../../llm/harness/index.ts";
import { automationStudioScreenedAuthoredState, automationStudioScreenedNodeParameters } from "../repair-context/index.ts";

/** A graph a part is read from: a Flow artifact carries its interface, a bare document none. */
export type AutomationStudioRepairUnitGraph = AutomationStudioFlowDocument & { interface?: unknown };

/**
 * The unit and its contract. `partGraph` is the called part's graph, required
 * for a part; `deniedEvidenceKeys` is the domain's declaration, and without one
 * a node's parameters are withheld whole rather than screened against nothing.
 */
export function automationStudioRepairUnitContract(input: {
  graph: AutomationStudioFlowDocument;
  unit: AutomationStudioRepairUnit;
  partGraph?: AutomationStudioRepairUnitGraph | undefined;
  deniedEvidenceKeys?: readonly string[] | undefined;
}): AutomationStudioLlmInRunRepairContract {
  const contract = unitContract(input);
  return automationStudioWithoutLocators(contract as unknown as JsonObject) as unknown as AutomationStudioLlmInRunRepairContract;
}

function unitContract(input: { graph: AutomationStudioFlowDocument; unit: AutomationStudioRepairUnit; partGraph?: AutomationStudioRepairUnitGraph | undefined; deniedEvidenceKeys?: readonly string[] | undefined }): AutomationStudioLlmInRunRepairContract {
  const { graph, unit } = input;
  if (unit.kind === "node") {
    const node = graph.nodes.find((candidate) => candidate.id === unit.nodeId);
    if (!node) return { kind: "node", nodeId: unit.nodeId, absent: true };
    return { kind: "node", ...nodeShape(node), parameters: screenedParameters(node, input.deniedEvidenceKeys), routes: routesOf(graph, node.id) };
  }
  if (unit.kind === "handler") {
    const read = automationStudioGraphHandlerRegistrations({ graphFlowId: graph.flowId, subflowId: null, nodes: graph.nodes, edges: graph.edges });
    const registration = read.registrations.find((candidate) => candidate.source.kind === "handler_node" && candidate.source.nodeId === unit.handlerNodeId);
    if (!registration) return { kind: "handler", handlerNodeId: unit.handlerNodeId, absent: true };
    return {
      kind: "handler",
      handlerNodeId: unit.handlerNodeId,
      event: registration.event,
      scope: registration.scope as unknown as JsonValue,
      when: screenedConditions(registration.when, "when"),
      completionCheck: screenedConditions(registration.completionCheck, "completionCheck"),
      order: registration.order,
      maxRuns: registration.maxRuns,
      body: handlerBody(graph, unit.handlerNodeId)
    };
  }
  const part = input.partGraph;
  if (!part) return { kind: "part", subflowId: unit.subflowId, absent: true };
  const contract = automationStudioSubflowContract(part);
  return {
    kind: "part",
    subflowId: unit.subflowId,
    name: part.name,
    interface: interfaceShape(part.interface),
    successCheck: screenedConditions(contract.successCheck, "successCheck"),
    entries: contract.entries.map((entry) => ({ id: entry.id, nodeId: entry.nodeId, order: entry.order, requires: [...entry.requires] })),
    checkpoints: contract.checkpoints.map((checkpoint) => ({ id: checkpoint.id, nodeId: checkpoint.nodeId, requires: [...checkpoint.requires] })),
    steps: part.nodes.map((node) => nodeShape(node))
  };
}

function nodeShape(node: AutomationStudioFlowNode): AutomationStudioLlmInRunRepairStep {
  return {
    nodeId: node.id,
    definitionId: node.definitionId,
    ...(node.definitionVersion ? { definitionVersion: node.definitionVersion } : {}),
    ...(node.label ? { label: node.label } : {}),
    ...(node.description ? { description: node.description } : {})
  };
}

function screenedParameters(node: AutomationStudioFlowNode, deniedEvidenceKeys: readonly string[] | undefined): { values: JsonObject; withheld?: string[] } | { withheld: "no_denied_keys_declared" } {
  if (!deniedEvidenceKeys) return { withheld: "no_denied_keys_declared" };
  const screened = automationStudioScreenedNodeParameters(node.parameterValues ?? {}, deniedEvidenceKeys);
  return { values: screened.values, ...(screened.withheld.length ? { withheld: screened.withheld } : {}) };
}

/** Where each port of a node leads, by port and target id. */
function routesOf(graph: AutomationStudioFlowDocument, nodeId: string): Array<{ port: string; to: string }> {
  return graph.edges
    .filter((edge) => edge.sourceNodeId === nodeId)
    .map((edge) => ({ port: edge.sourcePortId ?? "success", to: edge.targetNodeId }));
}

/** The nodes a handler's body runs, in the order its `body` port and `success` edges reach them. */
function handlerBody(graph: AutomationStudioFlowDocument, handlerNodeId: string): AutomationStudioLlmInRunRepairStep[] {
  const body: AutomationStudioLlmInRunRepairStep[] = [];
  const seen = new Set<string>([handlerNodeId]);
  let next = graph.edges.find((edge) => edge.sourceNodeId === handlerNodeId && edge.sourcePortId === "body")?.targetNodeId;
  while (next && !seen.has(next)) {
    seen.add(next);
    const node = graph.nodes.find((candidate) => candidate.id === next);
    if (!node) break;
    body.push(nodeShape(node));
    const from: string = node.id;
    next = graph.edges.find((edge) => edge.sourceNodeId === from && (edge.sourcePortId ?? "success") === "success")?.targetNodeId;
  }
  return body;
}

function screenedConditions(conditions: readonly unknown[], path: string): JsonValue {
  return automationStudioScreenedAuthoredState({ conditions: conditions as unknown as JsonValue }, path).value.conditions ?? [];
}

/** A part's interface by name and type: what it takes and what it gives back. */
function interfaceShape(value: unknown): { inputs: AutomationStudioLlmInRunRepairPort[]; outputs: AutomationStudioLlmInRunRepairPort[] } {
  const read = (list: unknown): AutomationStudioLlmInRunRepairPort[] => (Array.isArray(list) ? list : []).flatMap((port) => {
    if (!port || typeof port !== "object") return [];
    const record = port as Record<string, unknown>;
    if (typeof record.id !== "string") return [];
    return [{ id: record.id, ...(typeof record.name === "string" ? { name: record.name } : {}), ...(typeof record.valueType === "string" ? { valueType: record.valueType } : {}), ...(record.required === true ? { required: true } : {}) }];
  });
  const shape = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return { inputs: read(shape.inputs), outputs: read(shape.outputs) };
}
