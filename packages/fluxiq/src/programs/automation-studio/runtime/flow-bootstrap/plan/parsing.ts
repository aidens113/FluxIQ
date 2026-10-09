// Structural parsing of an untrusted Bootstrap plan: shape, field sets, key
// syntax, and the count and byte bounds. It knows nothing of the node
// registry -- registry agreement is validation.ts.
//
// The node, edge and byte bounds are the Flow's own (`./size-limits.ts`),
// passed in by a caller that has the Flow and the setting's default otherwise,
// and a plan over one is refused naming the setting that bounds it.
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { automationStudioRouteSignaturesValue } from "../../route-state/signatures/index.ts";
import { boundedText, error, identifier, rejectFields, symbolic } from "./issues.ts";
import { isJsonObject, isRecord, safeByteLength } from "./json-guards.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS } from "./limits.ts";
import {
  automationStudioFlowBootstrapSizeLimits,
  automationStudioFlowBootstrapSizeRefusal,
  type AutomationStudioFlowBootstrapSizeLimits
} from "./size-limits.ts";

export function parseAutomationStudioFlowBootstrapPlan(
  value: unknown,
  size: AutomationStudioFlowBootstrapSizeLimits = automationStudioFlowBootstrapSizeLimits()
): {
  plan?: AutomationStudioFlowBootstrapPlan;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  if (!isRecord(value)) return { issues: [error("bootstrap.invalid_plan", "Bootstrap plan must be an object.", "plan")] };
  rejectFields(value, ["schemaVersion", "router", "subflows", "metadata"], "plan", issues);
  if (value.schemaVersion !== "0.1") issues.push(error("bootstrap.invalid_schema_version", "Bootstrap plan schemaVersion must be 0.1.", "plan.schemaVersion"));
  parseRouter(value.router, issues);
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) issues.push(error("bootstrap.invalid_metadata", "Plan metadata must be an object.", "plan.metadata"));
    else {
      rejectFields(value.metadata, ["requires"], "plan.metadata", issues);
      parseRequires(value.metadata.requires, "plan.metadata.requires", issues);
    }
  }
  if (!Array.isArray(value.subflows)) issues.push(error("bootstrap.invalid_subflows", "Bootstrap subflows must be an array.", "plan.subflows"));
  else if (value.subflows.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows) issues.push(error("bootstrap.too_many_subflows", "Bootstrap plan exceeds the Subflow limit.", "plan.subflows"));
  else {
    value.subflows.forEach((subflow, index) => parseSubflow(subflow, index, size, issues));
    const totalNodes = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.nodes) ? subflow.nodes.length : 0), 0);
    const totalEdges = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.edges) ? subflow.edges.length : 0), 0);
    if (totalNodes > size.maxTotalNodes) issues.push(error("bootstrap.too_many_nodes", automationStudioFlowBootstrapSizeRefusal(`Bootstrap plan has ${totalNodes} nodes in all`, "maxTotalNodes", size), "plan.subflows"));
    if (totalEdges > size.maxTotalEdges) issues.push(error("bootstrap.too_many_edges", automationStudioFlowBootstrapSizeRefusal(`Bootstrap plan has ${totalEdges} edges in all`, "maxTotalEdges", size), "plan.subflows"));
  }
  const planBytes = safeByteLength(value);
  if (planBytes > size.maxPlanBytes) {
    issues.push(error("bootstrap.plan_too_large", automationStudioFlowBootstrapSizeRefusal(`Bootstrap plan is ${planBytes} bytes`, "maxPlanBytes", size), "plan"));
  }
  return issues.some((issue) => issue.severity === "error")
    ? { issues }
    : { plan: value as unknown as AutomationStudioFlowBootstrapPlan, issues };
}

function parseRouter(value: unknown, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_router", "Bootstrap router must be an object.", "plan.router"));
    return;
  }
  rejectFields(value, ["name", "rules", "fallback"], "plan.router", issues);
  boundedText(value.name, "plan.router.name", issues);
  if (!Array.isArray(value.rules) || value.rules.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows) {
    issues.push(error("bootstrap.invalid_router_rules", "Router rules must be a bounded array.", "plan.router.rules"));
  } else value.rules.forEach((rule, index) => {
    const path = `plan.router.rules.${index}`;
    if (!isRecord(rule)) {
      issues.push(error("bootstrap.invalid_router_rule", "Router rule must be an object.", path));
      return;
    }
    rejectFields(rule, ["key", "name", "targetSubflowKey", "routeTags", "condition"], path, issues);
    symbolic(rule.key, `${path}.key`, issues);
    boundedText(rule.name, `${path}.name`, issues);
    symbolic(rule.targetSubflowKey, `${path}.targetSubflowKey`, issues);
    if (!Array.isArray(rule.routeTags) || rule.routeTags.length > 16 || !rule.routeTags.every((tag) => typeof tag === "string" && tag.length > 0 && tag.length <= 100)) {
      issues.push(error("bootstrap.invalid_route_tags", "Router routeTags must be a bounded nonempty string array.", `${path}.routeTags`));
    }
  });
  if (!isRecord(value.fallback)) issues.push(error("bootstrap.invalid_router_fallback", "Router fallback must be an object.", "plan.router.fallback"));
  else if (value.fallback.kind === "fail") rejectFields(value.fallback, ["kind"], "plan.router.fallback", issues);
  else if (value.fallback.kind === "subflow") {
    rejectFields(value.fallback, ["kind", "targetSubflowKey"], "plan.router.fallback", issues);
    symbolic(value.fallback.targetSubflowKey, "plan.router.fallback.targetSubflowKey", issues);
  } else issues.push(error("bootstrap.invalid_router_fallback", "Router fallback kind is invalid.", "plan.router.fallback.kind"));
}

function parseSubflow(value: unknown, index: number, size: AutomationStudioFlowBootstrapSizeLimits, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const path = `plan.subflows.${index}`;
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_subflow", "Subflow must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "name", "role", "nodes", "edges", "interface", "metadata"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  boundedText(value.name, `${path}.name`, issues);
  if (!["primary", "integration", "recovery", "fallback", "utility"].includes(String(value.role))) issues.push(error("bootstrap.invalid_subflow_role", "Subflow role is invalid.", `${path}.role`));
  if (!Array.isArray(value.nodes) || value.nodes.length === 0) {
    issues.push(error("bootstrap.invalid_nodes", "Subflow nodes must be a nonempty bounded array.", `${path}.nodes`));
  } else if (value.nodes.length > size.maxNodesPerSubflow) {
    issues.push(error("bootstrap.invalid_nodes", automationStudioFlowBootstrapSizeRefusal(`Subflow has ${value.nodes.length} nodes`, "maxNodesPerSubflow", size), `${path}.nodes`));
  } else value.nodes.forEach((node, nodeIndex) => parseNode(node, `${path}.nodes.${nodeIndex}`, issues));
  if (!Array.isArray(value.edges)) {
    issues.push(error("bootstrap.invalid_edges", "Subflow edges must be a bounded array.", `${path}.edges`));
  } else if (value.edges.length > size.maxEdgesPerSubflow) {
    issues.push(error("bootstrap.invalid_edges", automationStudioFlowBootstrapSizeRefusal(`Subflow has ${value.edges.length} edges`, "maxEdgesPerSubflow", size), `${path}.edges`));
  } else value.edges.forEach((edge, edgeIndex) => parseEdge(edge, `${path}.edges.${edgeIndex}`, issues));
  if (value.interface !== undefined) parseInterface(value.interface, `${path}.interface`, issues);
  if (value.metadata !== undefined) {
    if (!isRecord(value.metadata)) issues.push(error("bootstrap.invalid_metadata", "Subflow metadata must be an object.", `${path}.metadata`));
    else {
      rejectFields(value.metadata, ["fluxiq.successCheck", "requires"], `${path}.metadata`, issues);
      if (value.metadata.requires !== undefined) parseRequires(value.metadata.requires, `${path}.metadata.requires`, issues);
      if (value.metadata["fluxiq.successCheck"] !== undefined) parseFacts(value.metadata["fluxiq.successCheck"], `${path}.metadata.fluxiq.successCheck`, issues);
    }
  }
}

function parseNode(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_node", "Bootstrap node must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "definitionId", "definitionVersion", "parameters", "outputActionId", "consequences", "routeSignatures", "label", "paceMs", "metadata"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  identifier(value.definitionId, `${path}.definitionId`, issues);
  boundedText(value.definitionVersion, `${path}.definitionVersion`, issues);
  if (value.parameters !== undefined && !isJsonObject(value.parameters)) issues.push(error("bootstrap.invalid_parameters", "Node parameters must be a JSON object.", `${path}.parameters`));
  if (value.outputActionId !== undefined) identifier(value.outputActionId, `${path}.outputActionId`, issues);
  // Bounded only. What a class means is `runtime/action-permissions/`'s, and it
  // reads this fail-closed; a plan reader that learned the vocabulary would be
  // a second place for it to drift.
  if (value.consequences !== undefined
    && (!Array.isArray(value.consequences) || value.consequences.length > 10
      || !value.consequences.every((item) => typeof item === "string" && item.length > 0 && item.length <= 40))) {
    issues.push(error("bootstrap.invalid_consequences", "Node consequences must be a bounded string array.", `${path}.consequences`));
  }
  // Read by the one test a running node's metadata is read by, so a plan never
  // carries a value the node would read as nothing (`../../route-state/signatures/`).
  if (value.routeSignatures !== undefined && !automationStudioRouteSignaturesValue(value.routeSignatures)) {
    issues.push(error("bootstrap.invalid_route_signatures", "Node routeSignatures must hold a before and/or an after, each a small JSON object.", `${path}.routeSignatures`));
  }
  if (value.label !== undefined) boundedText(value.label, `${path}.label`, issues);
  // A whole number of milliseconds within the bound, as the run reads a node's
  // pace (`../../executor/pacing/pace-metadata.ts`): a plan never carries a pace
  // the run would read as none.
  if (value.paceMs !== undefined
    && (typeof value.paceMs !== "number" || !Number.isSafeInteger(value.paceMs)
      || value.paceMs < AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.minPaceMs || value.paceMs > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.maxPaceMs)) {
    issues.push(error("bootstrap.invalid_pace", `Node paceMs must be a whole number of milliseconds from ${AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.minPaceMs} to ${AUTOMATION_STUDIO_FLOW_BOOTSTRAP_PACE_LIMITS.maxPaceMs}.`, `${path}.paceMs`));
  }
  if (value.metadata !== undefined) parseNodeMetadata(value.metadata, `${path}.metadata`, issues);
}

function parseEdge(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_edge", "Bootstrap edge must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "source", "target"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  parseEndpoint(value.source, `${path}.source`, issues);
  parseEndpoint(value.target, `${path}.target`, issues);
}

function parseEndpoint(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_endpoint", "Edge endpoint must be an object.", path));
    return;
  }
  rejectFields(value, ["nodeKey", "portId"], path, issues);
  symbolic(value.nodeKey, `${path}.nodeKey`, issues);
  identifier(value.portId, `${path}.portId`, issues);
}


// The state-aware recovery declarations a script's statements write
// (`../script-statements/`): an entry or checkpoint on a node, a part's
// interface, a Subflow's success check and what the Flow requires. Shape and
// bounds only; what each means is the runtime's (C2, C9, C10).

/** Most facts one condition list may hold, most requirement ids a Flow may name, and most ports an interface may declare. */
const MAX_FACTS = 16;
const MAX_REQUIRES = 16;
const MAX_INTERFACE_PORTS = 16;
const FACT_OPS = new Set(["exists", "absent", "visible", "enabled", "equals", "contains", "matches", "count"]);
const REQUIREMENT = /^[a-z][a-z0-9.-]{0,63}@[0-9]{1,4}$/u;
const PORT_NAME = /^[a-z][A-Za-z0-9]{0,31}$/u;

function parseRequires(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!Array.isArray(value) || value.length > MAX_REQUIRES || !value.every((item) => typeof item === "string" && REQUIREMENT.test(item))) {
    issues.push(error("bootstrap.invalid_requires", "Requires must be a bounded list of capability ids, each `<id>@<major>`.", path));
  }
}

function parseFacts(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_FACTS || !value.every(isFact)) {
    issues.push(error("bootstrap.invalid_fact_condition", "Fact conditions must be a nonempty bounded list of { fact, op, value?, target? }.", path));
  }
}

function isFact(value: unknown): boolean {
  if (!isRecord(value) || typeof value.fact !== "string" || !value.fact || value.fact.length > 64 || !FACT_OPS.has(String(value.op))) return false;
  if (Object.keys(value).some((key) => !["fact", "op", "value", "target"].includes(key))) return false;
  if (value.value !== undefined && !isFactValue(value.value)) return false;
  if (value.target === undefined) return true;
  if (typeof value.target === "string") return value.target.length > 0 && value.target.length <= 200;
  return isRecord(value.target) && value.target.kind === "dialog" && typeof value.target.role === "string" && typeof value.target.name === "string"
    && value.target.name.length <= 200 && value.target.role.length <= 40;
}

function isFactValue(value: unknown): boolean {
  if (typeof value === "string") return value.length <= 2_000;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (!isRecord(value) || Object.keys(value).length !== 1) return false;
  return (typeof value.input === "string" && PORT_NAME.test(value.input)) || (typeof value.value === "string" && value.value.length > 0 && value.value.length <= 200);
}

function parseNodeMetadata(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_metadata", "Node metadata must be an object.", path));
    return;
  }
  rejectFields(value, ["fluxiq.entry", "fluxiq.checkpoint"], path, issues);
  const entry = value["fluxiq.entry"];
  if (entry !== undefined) {
    const at = `${path}.fluxiq.entry`;
    if (!isRecord(entry)) issues.push(error("bootstrap.invalid_entry", "An entry must be { id, order, when, requires }.", at));
    else {
      rejectFields(entry, ["id", "order", "when", "requires"], at, issues);
      symbolic(entry.id, `${at}.id`, issues);
      if (typeof entry.order !== "number" || !Number.isSafeInteger(entry.order) || entry.order < 1) issues.push(error("bootstrap.invalid_entry", "An entry's order must be a whole number from 1.", `${at}.order`));
      parseFacts(entry.when, `${at}.when`, issues);
      parseNames(entry.requires, `${at}.requires`, issues);
    }
  }
  const checkpoint = value["fluxiq.checkpoint"];
  if (checkpoint !== undefined) {
    const at = `${path}.fluxiq.checkpoint`;
    if (!isRecord(checkpoint)) issues.push(error("bootstrap.invalid_checkpoint", "A checkpoint must be { id, when?, requires }.", at));
    else {
      rejectFields(checkpoint, ["id", "when", "requires"], at, issues);
      symbolic(checkpoint.id, `${at}.id`, issues);
      if (checkpoint.when !== undefined) parseFacts(checkpoint.when, `${at}.when`, issues);
      parseNames(checkpoint.requires, `${at}.requires`, issues);
    }
  }
}

function parseNames(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!Array.isArray(value) || value.length > MAX_INTERFACE_PORTS || !value.every((item) => typeof item === "string" && PORT_NAME.test(item))) {
    issues.push(error("bootstrap.invalid_requires", "Requires must be a bounded list of input names.", path));
  }
}

function parseInterface(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_interface", "A Subflow interface must be { inputs, outputs }.", path));
    return;
  }
  rejectFields(value, ["inputs", "outputs"], path, issues);
  for (const side of ["inputs", "outputs"] as const) {
    const ports = value[side];
    if (!Array.isArray(ports) || ports.length > MAX_INTERFACE_PORTS) {
      issues.push(error("bootstrap.invalid_interface", `A Subflow interface's ${side} must be a bounded array.`, `${path}.${side}`));
      continue;
    }
    ports.forEach((port, index) => {
      const at = `${path}.${side}.${index}`;
      if (!isRecord(port) || typeof port.id !== "string" || !PORT_NAME.test(port.id) || typeof port.name !== "string" || !isRecord(port.valueType)) {
        issues.push(error("bootstrap.invalid_interface", "An interface port must be { id, name, valueType }.", at));
        return;
      }
      rejectFields(port, ["id", "name", "valueType", "required", "metadata"], at, issues);
      if (port.metadata !== undefined && !(isRecord(port.metadata) && isJsonObject(port.metadata.binding) && Object.keys(port.metadata).length === 1)) {
        issues.push(error("bootstrap.invalid_interface", "An interface port's metadata holds only its binding.", `${at}.metadata`));
      }
    });
  }
}
