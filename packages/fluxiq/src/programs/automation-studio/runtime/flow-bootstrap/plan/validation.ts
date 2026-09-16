// Validating a structurally parsed plan against the node registry: every node
// resolves at its declared version, every parameter and output action matches
// its definition, every edge connects compatible ports, and each Subflow graph
// is one connected acyclic graph within the depth limit. The accepted plan is
// returned laid out and risk-banded.
//
// A parameter value the runtime would refuse is refused here, so a malformed
// structured value never reaches dispatch: record outputs, the output a policy
// action runs, and a domain's bound parameter contract are all checked.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import {
  AutomationStudioNodeRegistry,
  isAutomationNodeParameterStateBinding,
  parseAutomationStudioRecordOutput,
  type AutomationNodeParameter,
  type AutomationNodePort,
  type AutomationStudioNodeDefinition,
  type AutomationStudioNodeParameterContract,
  type AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type {
  AutomationStudioFlowBootstrapIssue,
  AutomationStudioFlowBootstrapNode,
  AutomationStudioFlowBootstrapPlan,
  AutomationStudioFlowBootstrapSubflow,
  AutomationStudioValidatedFlowBootstrapPlan
} from "./contracts.ts";
import { error } from "./issues.ts";
import { layoutNodes } from "./layout.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";
import { parseAutomationStudioFlowBootstrapPlan } from "./parsing.ts";
import { deriveRisk } from "./risk.ts";

export function validateAutomationStudioFlowBootstrapPlan(input: {
  plan: AutomationStudioFlowBootstrapPlan;
  registry?: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
}): { ok: boolean; issues: AutomationStudioFlowBootstrapIssue[]; validated?: AutomationStudioValidatedFlowBootstrapPlan } {
  const structural = parseAutomationStudioFlowBootstrapPlan(input.plan);
  if (!structural.plan) return { ok: false, issues: structural.issues };
  const registry = input.registry ?? new AutomationStudioNodeRegistry();
  const issues = [...structural.issues];
  let outputIds: ReadonlySet<string> | undefined;
  const scope: ValidationScope = {
    registry,
    resolution: input.resolution,
    outputIds: () => outputIds ??= declaredOutputIds(registry, input.resolution)
  };
  const subflowKeys = new Set<string>();
  const primary = input.plan.subflows.filter((subflow) => subflow.role === "primary");
  if (primary.length !== 1) issues.push(error("bootstrap.primary_count", "Bootstrap plan must define exactly one primary Subflow.", "plan.subflows"));
  for (const [subflowIndex, subflow] of input.plan.subflows.entries()) {
    if (subflowKeys.has(subflow.key)) issues.push(error("bootstrap.duplicate_subflow_key", "Subflow keys must be unique.", `plan.subflows.${subflowIndex}.key`));
    subflowKeys.add(subflow.key);
    validateSubflow(subflow, subflowIndex, scope, issues);
  }
  const routerRuleKeys = new Set<string>();
  for (const [index, rule] of input.plan.router.rules.entries()) {
    if (routerRuleKeys.has(rule.key)) issues.push(error("bootstrap.duplicate_router_rule_key", "Router rule keys must be unique.", `plan.router.rules.${index}.key`));
    routerRuleKeys.add(rule.key);
    if (!subflowKeys.has(rule.targetSubflowKey)) issues.push(error("bootstrap.unknown_router_target", "Router rule targets an unknown Subflow key.", `plan.router.rules.${index}.targetSubflowKey`));
  }
  if (input.plan.router.fallback.kind === "subflow" && !subflowKeys.has(input.plan.router.fallback.targetSubflowKey)) {
    issues.push(error("bootstrap.unknown_router_fallback", "Router fallback targets an unknown Subflow key.", "plan.router.fallback.targetSubflowKey"));
  }
  if (issues.some((issue) => issue.severity === "error")) return { ok: false, issues };
  const subflows = input.plan.subflows.map((subflow) => ({
    ...subflow,
    nodes: layoutNodes(subflow)
  }));
  return {
    ok: true,
    issues,
    validated: {
      plan: input.plan,
      risk: deriveRisk(input.plan, registry, input.resolution),
      subflows
    }
  };
}

/** What validating one plan reads from the registry. */
type ValidationScope = {
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
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
    }
  }
  validateRequiredInputConnections(subflow, nodes, issues, path);
  validateConnectivityAndDepth(nodes, adjacency, indegree, undirected, issues, path);
}

function validateParameters(values: JsonObject, definition: AutomationStudioNodeDefinition, path: string, scope: ValidationScope, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const byId = new Map(definition.parameters.map((parameter) => [parameter.id, parameter]));
  for (const key of Object.keys(values)) if (!byId.has(key)) issues.push(error("bootstrap.unknown_parameter", "Node parameter is not declared by its definition.", `${path}.parameters.${key}`));
  const contract = scope.registry.getParameterContract(definition.id);
  for (const parameter of definition.parameters) {
    const value = values[parameter.id];
    if (value === undefined) {
      if (parameter.required && parameter.defaultValue === undefined) issues.push(error("bootstrap.missing_parameter", "Required node parameter is missing.", `${path}.parameters.${parameter.id}`));
      continue;
    }
    const parameterPath = `${path}.parameters.${parameter.id}`;
    const namesOutput = namesOutputToRun(definition, parameter);
    if (isAutomationNodeParameterStateBinding(value)) {
      // A bound output id would let the run choose which output runs.
      if (parameter.allowStateBinding === false || !value.$state.path.trim() || namesOutput) issues.push(error("bootstrap.invalid_state_binding", "Parameter does not allow this state binding.", parameterPath));
      continue;
    }
    const nestedBindingPath = invalidStateBindingPath(value, parameter.allowStateBinding !== false, parameterPath, 0);
    if (nestedBindingPath) issues.push(error("bootstrap.invalid_state_binding", "Parameter does not allow this state binding.", nestedBindingPath));
    const recordOutput = parameter.ui?.control === "record-output";
    // Null is how a record output saves nothing, as the runtime reads it.
    if (recordOutput && value === null) continue;
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

// Parsed as the policy action and record capture parse it before they dispatch
// or save, encryption refused included, so each code is one the run would have
// failed with. A record output that leaves `recordsPath` out takes the path its
// definition declares in `metadata.recordsPath`, as an importer node fills it at
// dispatch; when the definition declares none, the missing path is refused.
function recordOutputIssues(value: JsonValue, definition: AutomationStudioNodeDefinition, path: string): AutomationStudioFlowBootstrapIssue[] {
  const declaredPath = definition.metadata?.recordsPath;
  const completed = typeof declaredPath === "string" && isPlainObject(value) && !Object.hasOwn(value, "recordsPath")
    ? { ...value, recordsPath: declaredPath }
    : value;
  const parsed = parseAutomationStudioRecordOutput(completed);
  return parsed.ok ? [] : parsed.issues.map((code) => error(code, "Record output does not satisfy the record-set contract.", path));
}

const isPlainObject = (value: JsonValue): value is JsonObject => typeof value === "object" && value !== null && !Array.isArray(value);

const CONTRACT_FAILED = "bootstrap.parameter_contract_failed";
const CONTRACT_VIOLATION = "bootstrap.parameter_contract_violation";
const MAX_CONTRACT_ISSUE_CODES = 8;
const MAX_CONTRACT_ISSUE_CODE_LENGTH = 120;
const CONTRACT_ISSUE_CODE = /^[a-z][a-z0-9_-]*(?:\.[a-z0-9_-]+)+$/;

// The contract is domain code, so its answer is bounded, and a code is kept
// only when it is a plain identifier that cannot pass for one of Core's own.
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
    if (codes.size >= MAX_CONTRACT_ISSUE_CODES) break;
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

function validateConnectivityAndDepth(
  nodes: Map<string, unknown>,
  adjacency: Map<string, string[]>,
  indegree: Map<string, number>,
  undirected: Map<string, string[]>,
  issues: AutomationStudioFlowBootstrapIssue[],
  path: string
): void {
  if (!nodes.size) return;
  const first = nodes.keys().next().value as string;
  const seen = new Set<string>([first]);
  const queue = [first];
  while (queue.length) {
    const key = queue.shift()!;
    for (const next of undirected.get(key) ?? []) if (!seen.has(next)) {
      seen.add(next);
      queue.push(next);
    }
  }
  if (seen.size !== nodes.size) issues.push(error("bootstrap.disconnected_graph", "Every node in a Subflow must belong to one connected graph.", `${path}.nodes`));
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
  if (visited !== nodes.size) issues.push(error("bootstrap.cyclic_graph", "Bootstrap Subflow graphs must be acyclic.", `${path}.edges`));
  if (Math.max(0, ...depths.values()) + 1 > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxGraphDepth) issues.push(error("bootstrap.graph_too_deep", "Bootstrap Subflow exceeds the graph-depth limit.", `${path}.edges`));
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
    || ((type === "object" || type === "json") && (value === null || typeof value !== "object" || Array.isArray(value)))) return false;
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
