// Validating a structurally parsed plan against the node registry: every node
// resolves at its declared version, every parameter and output action matches
// its definition, every edge connects compatible ports, and each Subflow graph
// is one connected acyclic graph within the depth limit. The accepted plan is
// returned laid out and risk-banded.
//
// The count, depth and byte bounds are the Flow's own (`./size-limits.ts`):
// a caller with the Flow in hand passes them, and every other caller is held
// to the setting's default.
//
// A parameter value the runtime would refuse is refused here, so a malformed
// structured value never reaches dispatch: record outputs, the output a policy
// action runs, and a domain's bound parameter contract are all checked.
//
// A name, by contrast, is resolved before it is checked. A parameter key that
// is plainly one of the node's own, written with a slip, is corrected in the
// plan and recorded as an assumption (`./name-correction.ts`); the corrected
// plan is what is validated, laid out, risked and returned, so the node runs
// with the name it meant. Nothing below is relaxed by that: a corrected key
// faces exactly the checks a correctly written one faces, and a key with no
// plausible candidate reaches `bootstrap.unknown_parameter` untouched.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AutomationStudioNodeRegistry,
  isAutomationNodeParameterStateBinding,
  type AutomationNodeParameter,
  type AutomationNodePort,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeParameterContract,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import {
  AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS,
  type AutomationStudioFlowBootstrapIssue,
  type AutomationStudioFlowBootstrapNode,
  type AutomationStudioFlowBootstrapPlan,
  type AutomationStudioFlowBootstrapSubflow,
  type AutomationStudioValidatedFlowBootstrapPlan
} from "./contracts.ts";
import { error } from "./issues.ts";
import { layoutNodes } from "./layout.ts";
import { correctAutomationStudioFlowBootstrapPlanNames } from "./name-correction.ts";
import type { AutomationStudioFlowBootstrapNameAssumption } from "./name-correction-assumption.ts";
import { parseAutomationStudioFlowBootstrapPlan } from "./parsing.ts";
import { automationStudioFlowBootstrapRecordOutputIssues } from "./record-output-contract.ts";
import { deriveRisk } from "./risk.ts";
import { automationStudioFlowBootstrapRouteIssues } from "./route-validation.ts";
import {
  automationStudioFlowBootstrapSizeLimits,
  automationStudioFlowBootstrapSizeRefusal,
  type AutomationStudioFlowBootstrapSizeLimits
} from "./size-limits.ts";

export function validateAutomationStudioFlowBootstrapPlan(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** The Flow's size bounds (`automationStudioFlowBootstrapSizeLimitsOf`); the setting's default when omitted. */
  size?: AutomationStudioFlowBootstrapSizeLimits;
}): {
  ok: boolean;
  issues: AutomationStudioFlowBootstrapIssue[];
  /**
   * The accepted plan, with the names that were resolved rather than written
   * listed beside it. `assumptions` is absent on a plan that needed none, so a
   * correctly written plan is handed on exactly as it arrived.
   */
  validated?: AutomationStudioValidatedFlowBootstrapPlan & { assumptions?: readonly AutomationStudioFlowBootstrapNameAssumption[] };
} {
  const size = input.size ?? automationStudioFlowBootstrapSizeLimits();
  const structural = parseAutomationStudioFlowBootstrapPlan(input.plan, size);
  if (!structural.plan) return { ok: false, issues: structural.issues };
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  // Names are resolved before anything is checked, so every check below reads
  // the plan as it will be built and run rather than as it was written, and a
  // near-miss parameter name is corrected in the plan instead of refusing the
  // whole build (`./name-correction.ts`). A name with no plausible candidate is
  // left as written and still refused below.
  const { plan, assumptions } = correctAutomationStudioFlowBootstrapPlanNames({
    plan: structural.plan,
    registry,
    resolution: input.resolution
  });
  const issues = [...structural.issues];
  let outputIds: ReadonlySet<string> | undefined;
  const scope: ValidationScope = {
    registry,
    resolution: input.resolution,
    size,
    outputIds: () => outputIds ??= declaredOutputIds(registry, input.resolution)
  };
  const subflowKeys = new Set<string>();
  const primary = plan.subflows.filter((subflow) => subflow.role === "primary");
  if (primary.length !== 1) issues.push(error("bootstrap.primary_count", "Bootstrap plan must define exactly one primary Subflow.", "plan.subflows"));
  for (const [subflowIndex, subflow] of plan.subflows.entries()) {
    if (subflowKeys.has(subflow.key)) issues.push(error("bootstrap.duplicate_subflow_key", "Subflow keys must be unique.", `plan.subflows.${subflowIndex}.key`));
    subflowKeys.add(subflow.key);
    validateSubflow(subflow, subflowIndex, scope, issues);
  }
  const routerRuleKeys = new Set<string>();
  for (const [index, rule] of plan.router.rules.entries()) {
    if (routerRuleKeys.has(rule.key)) issues.push(error("bootstrap.duplicate_router_rule_key", "Router rule keys must be unique.", `plan.router.rules.${index}.key`));
    routerRuleKeys.add(rule.key);
    if (!subflowKeys.has(rule.targetSubflowKey)) issues.push(error("bootstrap.unknown_router_target", "Router rule targets an unknown Subflow key.", `plan.router.rules.${index}.targetSubflowKey`));
  }
  if (plan.router.fallback.kind === "subflow" && !subflowKeys.has(plan.router.fallback.targetSubflowKey)) {
    issues.push(error("bootstrap.unknown_router_fallback", "Router fallback targets an unknown Subflow key.", "plan.router.fallback.targetSubflowKey"));
  }
  issues.push(...automationStudioFlowBootstrapRouteIssues(plan));
  if (issues.some((issue) => issue.severity === "error")) return { ok: false, issues };
  const subflows = plan.subflows.map((subflow) => ({
    ...subflow,
    nodes: layoutNodes(subflow)
  }));
  return {
    ok: true,
    issues,
    validated: {
      plan,
      risk: deriveRisk(plan, registry, input.resolution),
      subflows,
      ...(assumptions.length ? { assumptions } : {})
    }
  };
}

/** What validating one plan reads from the registry. */
type ValidationScope = {
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  /** The Flow's size bounds; the graph-depth check reads them. */
  size: AutomationStudioFlowBootstrapSizeLimits;
  /** The output ids the available definitions declare, read once per plan. */
  outputIds(): ReadonlySet<string>;
};

function validateSubflow(
  subflow: AutomationStudioFlowBootstrapSubflow,
  subflowIndex: number,
  scope: ValidationScope,
  issues: AutomationStudioFlowBootstrapIssue[]
): void {
  const path = `plan.subflows.${subflowIndex}`;
  const nodes = new Map<string, { node: AutomationStudioFlowBootstrapNode; definition?: AutomationStudioNodeDefinition }>();
  for (const [nodeIndex, node] of subflow.nodes.entries()) {
    const nodePath = `${path}.nodes.${nodeIndex}`;
    if (nodes.has(node.key)) issues.push(error("bootstrap.duplicate_node_key", "Node keys must be unique within a Subflow.", `${nodePath}.key`));
    const definition = scope.registry.get(node.definitionId, scope.resolution);
    nodes.set(node.key, { node, ...(definition ? { definition } : {}) });
    if (!definition) {
      issues.push(error("bootstrap.definition_unavailable", "Node definition is missing or unavailable in this Flow scope.", `${nodePath}.definitionId`));
      continue;
    }
    if (node.definitionVersion !== definition.version) issues.push(error("bootstrap.definition_version_mismatch", "Node definition version must exactly match the registry.", `${nodePath}.definitionVersion`));
    validateParameters(node.parameters ?? {}, definition, nodePath, scope, issues);
    validateOutputAction(node, definition, nodePath, issues);
  }
  const edgeKeys = new Set<string>();
  const adjacency = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
  const indegree = new Map([...nodes.keys()].map((key) => [key, 0]));
  const undirected = new Map([...nodes.keys()].map((key) => [key, [] as string[]]));
  const connections = new Set<string>();
  const sourceConnections = new Map<string, number>();
  const targetConnections = new Map<string, number>();
  /** Edges arriving where several paths may arrive: where a loop closes, if one does. */
  const joined: Array<[string, string]> = [];
  for (const [edgeIndex, edge] of subflow.edges.entries()) {
    const edgePath = `${path}.edges.${edgeIndex}`;
    if (edgeKeys.has(edge.key)) issues.push(error("bootstrap.duplicate_edge_key", "Edge keys must be unique within a Subflow.", `${edgePath}.key`));
    edgeKeys.add(edge.key);
    const source = nodes.get(edge.source.nodeKey);
    const target = nodes.get(edge.target.nodeKey);
    if (!source) issues.push(error("bootstrap.unknown_source_node", "Edge source node is unknown.", `${edgePath}.source.nodeKey`));
    if (!target) issues.push(error("bootstrap.unknown_target_node", "Edge target node is unknown.", `${edgePath}.target.nodeKey`));
    if (edge.source.nodeKey === edge.target.nodeKey) issues.push(error("bootstrap.self_edge", "Self edges are not allowed in bootstrap plans.", edgePath));
    const connectionKey = `${edge.source.nodeKey}:${edge.source.portId}>${edge.target.nodeKey}:${edge.target.portId}`;
    if (connections.has(connectionKey)) issues.push(error("bootstrap.duplicate_connection", "Duplicate port connection is not allowed.", edgePath));
    connections.add(connectionKey);
    const sourcePort = source?.definition?.outputs.find((port) => port.id === edge.source.portId);
    const targetPort = target?.definition?.inputs.find((port) => port.id === edge.target.portId);
    if (source?.definition && !sourcePort) issues.push(error("bootstrap.unknown_source_port", "Edge source port is not an output of the selected definition.", `${edgePath}.source.portId`));
    if (target?.definition && !targetPort) issues.push(error("bootstrap.unknown_target_port", "Edge target port is not an input of the selected definition.", `${edgePath}.target.portId`));
    if (sourcePort && targetPort && !compatiblePorts(sourcePort, targetPort)) issues.push(error("bootstrap.incompatible_ports", "Edge port value types are incompatible.", edgePath));
    if (sourcePort) {
      const sourceKey = `${edge.source.nodeKey}:${edge.source.portId}`;
      const count = (sourceConnections.get(sourceKey) ?? 0) + 1;
      sourceConnections.set(sourceKey, count);
      if (count > 1 && !sourcePort.multiple) issues.push(error("bootstrap.source_port_cardinality", "Source port does not allow multiple connections.", `${edgePath}.source.portId`));
    }
    if (targetPort) {
      const targetKey = `${edge.target.nodeKey}:${edge.target.portId}`;
      const count = (targetConnections.get(targetKey) ?? 0) + 1;
      targetConnections.set(targetKey, count);
      if (count > 1 && !targetPort.multiple) issues.push(error("bootstrap.target_port_cardinality", "Target port does not allow multiple connections.", `${edgePath}.target.portId`));
    }
    if (source && target && source !== target) {
      adjacency.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
      indegree.set(edge.target.nodeKey, (indegree.get(edge.target.nodeKey) ?? 0) + 1);
      undirected.get(edge.source.nodeKey)?.push(edge.target.nodeKey);
      undirected.get(edge.target.nodeKey)?.push(edge.source.nodeKey);
      // An edge arriving where several paths may arrive is where a loop closes,
      // if anything does. Noted apart so the acyclicity check can ask what the
      // graph looks like without the joins (`validateConnectivityAndDepth`).
      if (targetPort?.multiple === true) joined.push([edge.source.nodeKey, edge.target.nodeKey]);
    }
  }
  validateRequiredInputConnections(subflow, nodes, issues, path);
  const handlers = new Set([...nodes].filter(([, item]) => item.node.definitionId === AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler).map(([key]) => key));
  validateConnectivityAndDepth(nodes, adjacency, indegree, undirected, joined, handlers, scope.size, issues, path);
}

function validateParameters(values: JsonObject, definition: AutomationStudioNodeDefinition, path: string, scope: ValidationScope, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const byId = new Map(definition.parameters.map((parameter) => [parameter.id, parameter]));
  for (const key of Object.keys(values)) if (!byId.has(key)) issues.push(error("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${path}.parameters.${key}`));
  const contract = scope.registry.getParameterContract(definition.id);
  for (const parameter of definition.parameters) {
    const value = values[parameter.id];
    const parameterPath = `${path}.parameters.${parameter.id}`;
    const recordOutput = parameter.ui?.control === "record-output";
    if (value === undefined) {
      if (parameter.required && parameter.defaultValue === undefined) issues.push(error("bootstrap.missing_parameter", "Required node parameter is missing.", parameterPath));
      // Not every node reads a missing record output as saving nothing.
      else if (recordOutput) issues.push(...recordOutputIssues(undefined, definition, parameterPath));
      continue;
    }
    const namesOutput = namesOutputToRun(definition, parameter);
    if (isAutomationNodeParameterStateBinding(value)) {
      // A bound output id would let the run choose which output runs.
      if (parameter.allowStateBinding === false || !value.$state.path.trim() || namesOutput) issues.push(error("bootstrap.invalid_state_binding", "Parameter does not allow this state binding.", parameterPath));
      continue;
    }
    const nestedBindingPath = invalidStateBindingPath(value, parameter.allowStateBinding !== false, parameterPath, 0);
    if (nestedBindingPath) issues.push(error("bootstrap.invalid_state_binding", "Parameter does not allow this state binding.", nestedBindingPath));
    // Null is how a record output saves nothing, on the nodes that read it so.
    if (recordOutput && value === null) {
      issues.push(...recordOutputIssues(null, definition, parameterPath));
      continue;
    }
    if (!parameterValueMatches(value, parameter)) {
      issues.push(error("bootstrap.invalid_parameter_value", "Node parameter value does not satisfy its definition.", parameterPath));
      continue;
    }
    if (nestedBindingPath) continue;
    if (recordOutput) issues.push(...recordOutputIssues(value, definition, parameterPath));
    if (namesOutput && (typeof value !== "string" || !scope.outputIds().has(value))) {
      issues.push(error("bootstrap.unknown_output_reference", "Parameter names an output that no available node declares.", parameterPath));
    }
    if (contract) for (const code of contractIssueCodes(contract, definition.id, parameter.id, value)) {
      issues.push(error(code, "Node parameter value does not satisfy its domain contract.", parameterPath));
    }
  }
}

/**
 * Core's own parameters whose value is the id of an output to dispatch. The
 * policy action's `outputId` is refused unless an available node declares that
 * output, fixed or allowed, which is every output a domain registers a node
 * for. `builtin.policy.recovery`'s fallback reference names a definition, not
 * an output, so it is not listed.
 */
const OUTPUT_TO_RUN_PARAMETERS: ReadonlyMap<string, string> = new Map([["builtin.policy.action", "outputId"]]);

function namesOutputToRun(definition: AutomationStudioNodeDefinition, parameter: AutomationNodeParameter): boolean {
  return definition.source.kind === "builtin" && OUTPUT_TO_RUN_PARAMETERS.get(definition.id) === parameter.id;
}

function declaredOutputIds(registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): ReadonlySet<string> {
  const ids = new Set<string>();
  for (const definition of registry.list(resolution)) {
    if (definition.outputAction?.fixedOutputId) ids.add(definition.outputAction.fixedOutputId);
    for (const id of definition.outputAction?.allowedOutputIds ?? []) ids.add(id);
  }
  return ids;
}

// Parsed with the record-set parser the nodes use, encryption refused included,
// after reading the value as the node reads it (`./record-output-contract.ts`):
// a missing path takes the one a definition declares in `metadata.recordsPath`,
// Core's node that writes records replaces any path with its own and refuses
// a missing or null record output, and the other nodes save nothing on null.
// So each code is one the run would have failed with, and a record output
// accepted here is one the run accepts.
function recordOutputIssues(value: JsonValue | undefined, definition: AutomationStudioNodeDefinition, path: string): AutomationStudioFlowBootstrapIssue[] {
  return automationStudioFlowBootstrapRecordOutputIssues(definition, value)
    .map((code) => error(code, "Record output does not satisfy the record-set contract.", path));
}

const CONTRACT_FAILED = "bootstrap.parameter_contract_failed";
const CONTRACT_VIOLATION = "bootstrap.parameter_contract_violation";
const MAX_CONTRACT_ISSUE_CODE_LENGTH = 120;
const CONTRACT_ISSUE_CODE = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/;

// The contract is domain code, so a code is kept only when it is a plain
// identifier that cannot pass for one of Core's own. Every such code is kept:
// until 2026-09-30 the first eight were.
function contractIssueCodes(contract: AutomationStudioNodeParameterContract, definitionId: string, parameterId: string, value: JsonValue): string[] {
  let reported: unknown;
  try {
    reported = contract({ definitionId, parameterId, value: structuredClone(value) });
  } catch {
    return [CONTRACT_FAILED];
  }
  if (!Array.isArray(reported)) {
    if (isThenable(reported)) reported.then(undefined, () => undefined);
    return [CONTRACT_FAILED];
  }
  const codes = new Set<string>();
  for (const code of reported) {
    codes.add(isContractIssueCode(code) ? code : CONTRACT_VIOLATION);
  }
  return [...codes];
}

function isContractIssueCode(code: unknown): code is string {
  return typeof code === "string"
    && code.length <= MAX_CONTRACT_ISSUE_CODE_LENGTH
    && !code.startsWith("bootstrap.")
    && CONTRACT_ISSUE_CODE.test(code);
}

const isThenable = (value: unknown): value is PromiseLike<unknown> => typeof value === "object" && value !== null && typeof (value as { then?: unknown }).then === "function";

function validateOutputAction(node: AutomationStudioFlowBootstrapNode, definition: AutomationStudioNodeDefinition, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const contract = definition.outputAction;
  if (!contract) {
    if (node.outputActionId !== undefined) issues.push(error("bootstrap.unexpected_output_action", "Node definition has no output action contract.", `${path}.outputActionId`));
    return;
  }
  if (!node.outputActionId) {
    issues.push(error("bootstrap.missing_output_action", "Node definition requires an explicit output action.", `${path}.outputActionId`));
    return;
  }
  if (contract.fixedOutputId && node.outputActionId !== contract.fixedOutputId) issues.push(error("bootstrap.invalid_output_action", "Node output action does not match the fixed output contract.", `${path}.outputActionId`));
  if (contract.allowedOutputIds && !contract.allowedOutputIds.includes(node.outputActionId)) issues.push(error("bootstrap.invalid_output_action", "Node output action is outside the allowed output contract.", `${path}.outputActionId`));
}

function validateRequiredInputConnections(
  subflow: AutomationStudioFlowBootstrapSubflow,
  nodes: Map<string, { node: AutomationStudioFlowBootstrapNode; definition?: AutomationStudioNodeDefinition }>,
  issues: AutomationStudioFlowBootstrapIssue[],
  path: string
): void {
  const connected = new Set(subflow.edges.map((edge) => `${edge.target.nodeKey}:${edge.target.portId}`));
  for (const [key, item] of nodes) for (const port of item.definition?.inputs ?? []) {
    if (port.required && !connected.has(`${key}:${port.id}`)) issues.push(error("bootstrap.required_input_unconnected", "Required node input port is not connected.", `${path}.nodes.${key}.inputs.${port.id}`));
  }
}

/**
 * Every node in one graph, no cycle a run could not leave, and a bounded depth.
 *
 * **A handler's body is a graph of its own.** A handler registration has no way
 * in: the run enters its body when the event it registers for fires (contract
 * C4), so the registration and the steps its `body` port leads to are apart
 * from the steps the Subflow runs in order. Each such group holds exactly one
 * registration; every other node still belongs to the one graph the Subflow
 * runs, and a Subflow that only registers handlers -- the recovery Subflow --
 * has no such graph at all.
 *
 * **Why a cycle is asked about twice.** A Flow that repeats a span is a cycle,
 * and refusing every cycle refused every loop -- so a draft could say "do this
 * for each row" and the plan it made was rejected for the shape that sentence
 * means. What a loop closes *through* is a join: `builtin.control.merge`
 * declares an input several edges may arrive at, and no ordinary node does. So
 * the graph is asked once as it stands, and, if that finds a cycle, again with
 * the joins removed. A cycle that survives the second ask does not pass through
 * a join, which means nothing in it was written to be arrived at twice, and it
 * is still refused. Depth is measured on the acyclic reading, since a loop has
 * no depth to measure.
 */
function validateConnectivityAndDepth(
  nodes: Map<string, unknown>,
  adjacency: Map<string, string[]>,
  indegree: Map<string, number>,
  undirected: Map<string, string[]>,
  joined: ReadonlyArray<readonly [string, string]>,
  handlers: ReadonlySet<string>,
  size: AutomationStudioFlowBootstrapSizeLimits,
  issues: AutomationStudioFlowBootstrapIssue[],
  path: string
): void {
  if (!nodes.size) return;
  const seen = new Set<string>();
  let ordinary = 0;
  let disconnected = false;
  for (const start of nodes.keys()) {
    if (seen.has(start)) continue;
    const component = [start];
    seen.add(start);
    for (let at = 0; at < component.length; at += 1) {
      for (const next of undirected.get(component[at]!) ?? []) if (!seen.has(next)) {
        seen.add(next);
        component.push(next);
      }
    }
    const registrations = component.filter((key) => handlers.has(key)).length;
    if (registrations > 1) disconnected = true;
    else if (registrations === 0 && (ordinary += 1) > 1) disconnected = true;
  }
  if (disconnected) issues.push(error("bootstrap.disconnected_graph", "Every node in a Subflow must belong to one connected graph, apart from each handler's own body.", `${path}.nodes`));
  let ordered = topologicalOrder(nodes, adjacency, indegree);
  if (ordered.visited !== nodes.size && joined.length) ordered = topologicalOrder(nodes, withoutJoins(adjacency, joined), withoutJoinDegrees(indegree, joined));
  if (ordered.visited !== nodes.size) issues.push(error("bootstrap.cyclic_graph", "Bootstrap Subflow graphs must be acyclic except where a loop closes through a join.", `${path}.edges`));
  const depth = Math.max(0, ...ordered.depths.values()) + 1;
  if (depth > size.maxGraphDepth) issues.push(error("bootstrap.graph_too_deep", automationStudioFlowBootstrapSizeRefusal(`Subflow is ${depth} nodes deep`, "maxGraphDepth", size), `${path}.edges`));
}

/** How many nodes a topological walk reaches, and how deep each one sits. */
function topologicalOrder(
  nodes: Map<string, unknown>,
  adjacency: Map<string, string[]>,
  indegree: Map<string, number>
): { visited: number; depths: Map<string, number> } {
  const degrees = new Map(indegree);
  const roots = [...degrees].filter(([, degree]) => degree === 0).map(([key]) => key).sort();
  const depths = new Map(roots.map((key) => [key, 0]));
  const topo = [...roots];
  let visited = 0;
  while (topo.length) {
    const key = topo.shift()!;
    visited += 1;
    for (const next of (adjacency.get(key) ?? []).sort()) {
      depths.set(next, Math.max(depths.get(next) ?? 0, (depths.get(key) ?? 0) + 1));
      degrees.set(next, (degrees.get(next) ?? 0) - 1);
      if (degrees.get(next) === 0) topo.push(next);
    }
    topo.sort();
  }
  return { visited, depths };
}

/** The same adjacency with one arrival removed for each join edge. */
function withoutJoins(adjacency: Map<string, string[]>, joined: ReadonlyArray<readonly [string, string]>): Map<string, string[]> {
  const reduced = new Map([...adjacency].map(([key, targets]) => [key, [...targets]] as [string, string[]]));
  for (const [source, target] of joined) {
    const targets = reduced.get(source);
    const at = targets?.indexOf(target) ?? -1;
    if (targets && at >= 0) targets.splice(at, 1);
  }
  return reduced;
}

/** The same indegrees with each join edge no longer counted. */
function withoutJoinDegrees(indegree: Map<string, number>, joined: ReadonlyArray<readonly [string, string]>): Map<string, number> {
  const reduced = new Map(indegree);
  for (const [, target] of joined) reduced.set(target, Math.max(0, (reduced.get(target) ?? 0) - 1));
  return reduced;
}

function compatiblePorts(source: AutomationNodePort, target: AutomationNodePort): boolean {
  return source.valueType === "any" || target.valueType === "any" || source.valueType === target.valueType;
}

function parameterValueMatches(value: JsonValue, parameter: AutomationNodeParameter): boolean {
  const type = parameter.valueType;
  if (parameter.options && (typeof value !== "string" || !parameter.options.some((option) => option.value === value))) return false;
  if ((type === "number" && typeof value !== "number")
    || ((type === "string" || type === "expression") && typeof value !== "string")
    || (type === "boolean" && typeof value !== "boolean")
    || (type === "array" && !Array.isArray(value))
    || (type === "object" && (value === null || typeof value !== "object" || Array.isArray(value)))
    // A `json` parameter holds any JSON value: a handler's `when` and
    // `completionCheck` are lists (`nodes/control-flow/handler.ts`).
    || (type === "json" && value === null)) return false;
  const constraints = parameter.constraints;
  if (!constraints) return true;
  if (typeof value === "number") {
    if (constraints.integer && !Number.isInteger(value)) return false;
    if (constraints.minimum !== undefined && value < constraints.minimum) return false;
    if (constraints.maximum !== undefined && value > constraints.maximum) return false;
  }
  if (typeof value === "string") {
    if (constraints.minLength !== undefined && value.length < constraints.minLength) return false;
    if (constraints.maxLength !== undefined && value.length > constraints.maxLength) return false;
    if (constraints.pattern !== undefined) {
      try { if (!new RegExp(constraints.pattern).test(value)) return false; } catch { return false; }
    }
  }
  return true;
}

/**
 * How deep a parameter value is searched for a state binding. Resolution stops
 * at 16 (`MAXIMUM_PARAMETER_VALUE_DEPTH`), and this is deliberately deeper, so
 * validation never stops short of what execution will honour: a binding the
 * validator cannot see but the resolver would answer is exactly the gap that
 * made `allowStateBinding: false` mean nothing for an object parameter.
 */
const MAXIMUM_NESTED_PARAMETER_DEPTH = 64;

/**
 * The path of the first state binding inside a parameter value that must not
 * carry one, or that names nothing.
 *
 * `allowStateBinding: false` used to be checked only where the parameter value
 * *was* a binding, while `resolveAutomationNodeParameterValues` resolves one
 * wherever it sits, so a literal-only object parameter could carry a binding one
 * level down and have it honoured at run time. The same predicate the resolver
 * uses decides here, so there is one notion of what a binding is rather than
 * two.
 *
 * A binding that is allowed and names a path is not descended into: its
 * `fallback` is handed to the node as it is, never resolved again.
 */
function invalidStateBindingPath(value: JsonValue, allowed: boolean, path: string, depth: number): string | undefined {
  if (!value || typeof value !== "object" || depth >= MAXIMUM_NESTED_PARAMETER_DEPTH) return undefined;
  const entries: Array<[string, JsonValue]> = Array.isArray(value) ? value.map((item, index) => [String(index), item]) : Object.entries(value);
  for (const [key, item] of entries) {
    const itemPath = `${path}.${key}`;
    if (isAutomationNodeParameterStateBinding(item)) {
      if (!allowed || !item.$state.path.trim()) return itemPath;
      continue;
    }
    const nested = invalidStateBindingPath(item, allowed, itemPath, depth + 1);
    if (nested) return nested;
  }
  return undefined;
}
