// Structural parsing of an untrusted Bootstrap plan: shape, field sets, key
// syntax, and the count and byte bounds. It knows nothing of the node
// registry -- registry agreement is validation.ts.
import type { AutomationStudioFlowBootstrapIssue, AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { boundedText, error, identifier, rejectFields, symbolic } from "./issues.ts";
import { isJsonObject, isRecord, safeByteLength } from "./json-guards.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

export function parseAutomationStudioFlowBootstrapPlan(value: unknown): {
  plan?: AutomationStudioFlowBootstrapPlan;
  issues: AutomationStudioFlowBootstrapIssue[];
} {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  if (!isRecord(value)) return { issues: [error("bootstrap.invalid_plan", "Bootstrap plan must be an object.", "plan")] };
  rejectFields(value, ["schemaVersion", "router", "subflows"], "plan", issues);
  if (value.schemaVersion !== "0.1") issues.push(error("bootstrap.invalid_schema_version", "Bootstrap plan schemaVersion must be 0.1.", "plan.schemaVersion"));
  parseRouter(value.router, issues);
  if (!Array.isArray(value.subflows)) issues.push(error("bootstrap.invalid_subflows", "Bootstrap subflows must be an array.", "plan.subflows"));
  else if (value.subflows.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows) issues.push(error("bootstrap.too_many_subflows", "Bootstrap plan exceeds the Subflow limit.", "plan.subflows"));
  else {
    value.subflows.forEach((subflow, index) => parseSubflow(subflow, index, issues));
    const totalNodes = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.nodes) ? subflow.nodes.length : 0), 0);
    const totalEdges = value.subflows.reduce((count, subflow) => count + (isRecord(subflow) && Array.isArray(subflow.edges) ? subflow.edges.length : 0), 0);
    if (totalNodes > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxTotalNodes) issues.push(error("bootstrap.too_many_nodes", "Bootstrap plan exceeds the total node limit.", "plan.subflows"));
    if (totalEdges > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxTotalEdges) issues.push(error("bootstrap.too_many_edges", "Bootstrap plan exceeds the total edge limit.", "plan.subflows"));
  }
  if (safeByteLength(value) > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxPlanBytes) {
    issues.push(error("bootstrap.plan_too_large", "Bootstrap plan exceeds the byte limit.", "plan"));
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
    rejectFields(rule, ["key", "name", "targetSubflowKey", "routeTags"], path, issues);
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

function parseSubflow(value: unknown, index: number, issues: AutomationStudioFlowBootstrapIssue[]): void {
  const path = `plan.subflows.${index}`;
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_subflow", "Subflow must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "name", "role", "nodes", "edges"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  boundedText(value.name, `${path}.name`, issues);
  if (!["primary", "integration", "recovery", "fallback", "utility"].includes(String(value.role))) issues.push(error("bootstrap.invalid_subflow_role", "Subflow role is invalid.", `${path}.role`));
  if (!Array.isArray(value.nodes) || value.nodes.length === 0 || value.nodes.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxNodesPerSubflow) {
    issues.push(error("bootstrap.invalid_nodes", "Subflow nodes must be a nonempty bounded array.", `${path}.nodes`));
  } else value.nodes.forEach((node, nodeIndex) => parseNode(node, `${path}.nodes.${nodeIndex}`, issues));
  if (!Array.isArray(value.edges) || value.edges.length > AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxEdgesPerSubflow) {
    issues.push(error("bootstrap.invalid_edges", "Subflow edges must be a bounded array.", `${path}.edges`));
  } else value.edges.forEach((edge, edgeIndex) => parseEdge(edge, `${path}.edges.${edgeIndex}`, issues));
}

function parseNode(value: unknown, path: string, issues: AutomationStudioFlowBootstrapIssue[]): void {
  if (!isRecord(value)) {
    issues.push(error("bootstrap.invalid_node", "Bootstrap node must be an object.", path));
    return;
  }
  rejectFields(value, ["key", "definitionId", "definitionVersion", "parameters", "outputActionId"], path, issues);
  symbolic(value.key, `${path}.key`, issues);
  identifier(value.definitionId, `${path}.definitionId`, issues);
  boundedText(value.definitionVersion, `${path}.definitionVersion`, issues);
  if (value.parameters !== undefined && !isJsonObject(value.parameters)) issues.push(error("bootstrap.invalid_parameters", "Node parameters must be a JSON object.", `${path}.parameters`));
  if (value.outputActionId !== undefined) identifier(value.outputActionId, `${path}.outputActionId`, issues);
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

