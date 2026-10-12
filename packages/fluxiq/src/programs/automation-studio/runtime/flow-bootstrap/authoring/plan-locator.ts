// Where each part of a JSON plan was written, for a reply that carried one
// rather than a Flow script.
//
// A JSON plan has no lines, so a refusal of one names the node as the model
// wrote it: its name, and its key, which the model chose. Read off the plan the
// refusal's paths index -- the plan as written when it was refused, the
// normalised plan when it was accepted -- so a path and its place agree; the
// names come from the plan as written, by key, since normalising keeps only
// what a plan node holds.
import type { AutomationStudioFlowBootstrapIssueLocator, AutomationStudioFlowScriptPlace } from "./contracts.ts";

/** The locator for a JSON plan, read from whatever shape it arrived in; nothing in it is assumed. */
export function automationStudioFlowBootstrapPlanLocator(plan: unknown, written: unknown = plan): AutomationStudioFlowBootstrapIssueLocator {
  const locator: AutomationStudioFlowBootstrapIssueLocator = { paths: {}, nodes: {}, edges: {}, subflows: {}, rules: {}, lines: [] };
  if (!isRecord(plan)) return locator;
  const named = writtenNames(written);
  const subflowPlaces = new Map<string, AutomationStudioFlowScriptPlace>();
  for (const [subflowIndex, subflow] of list(plan.subflows).entries()) {
    if (!isRecord(subflow)) continue;
    const key = text(subflow.key);
    const subflowPlace = place(text(subflow.name) ?? (key ? named.get(key) : undefined) ?? key, key);
    if (subflowPlace) {
      locator.subflows[String(subflowIndex)] = subflowPlace;
      if (key) subflowPlaces.set(key, subflowPlace);
    }
    const byKey = new Map<string, AutomationStudioFlowScriptPlace>();
    for (const [nodeIndex, node] of list(subflow.nodes).entries()) {
      if (!isRecord(node)) continue;
      const nodeKey = text(node.key);
      const parameters = isRecord(node.parameters) ? node.parameters : {};
      const nodePlace = place(nodeName(node) ?? (key && nodeKey ? named.get(`${key}/${nodeKey}`) : undefined) ?? text(parameters.name) ?? nodeKey ?? text(node.definitionId), nodeKey);
      if (!nodePlace) continue;
      locator.nodes[`${subflowIndex}.${nodeIndex}`] = nodePlace;
      if (nodeKey) byKey.set(nodeKey, nodePlace);
    }
    for (const [edgeIndex, edge] of list(subflow.edges).entries()) {
      const source = isRecord(edge) && isRecord(edge.source) ? text(edge.source.nodeKey) : undefined;
      const edgePlace = source ? byKey.get(source) : undefined;
      if (edgePlace) locator.edges[`${subflowIndex}.${edgeIndex}`] = edgePlace;
    }
  }
  const router = isRecord(plan.router) ? plan.router : {};
  for (const [ruleIndex, rule] of list(router.rules).entries()) {
    const target = isRecord(rule) ? text(rule.targetSubflowKey) : undefined;
    const rulePlace = target ? subflowPlaces.get(target) : undefined;
    if (rulePlace) locator.rules[String(ruleIndex)] = rulePlace;
  }
  const fallback = isRecord(router.fallback) ? text(router.fallback.targetSubflowKey) : undefined;
  const fallbackPlace = fallback ? subflowPlaces.get(fallback) : undefined;
  if (fallbackPlace) locator.fallback = fallbackPlace;
  return locator;
}

/** The name the model gave a node or a Subflow in the plan as written, by Subflow key and node key. */
function writtenNames(written: unknown): ReadonlyMap<string, string> {
  const names = new Map<string, string>();
  if (!isRecord(written)) return names;
  for (const subflow of list(written.subflows)) {
    if (!isRecord(subflow)) continue;
    const key = text(subflow.key);
    if (!key) continue;
    const name = text(subflow.name);
    if (name) names.set(key, name);
    for (const node of list(subflow.nodes)) {
      const nodeKey = isRecord(node) ? text(node.key) : undefined;
      const nodeNamed = isRecord(node) ? nodeName(node) : undefined;
      if (nodeKey && nodeNamed) names.set(`${key}/${nodeKey}`, nodeNamed);
    }
  }
  return names;
}

function nodeName(node: Record<string, unknown>): string | undefined {
  return text(node.name) ?? text(node.label) ?? text(node.description);
}

function place(step: string | undefined, label: string | undefined): AutomationStudioFlowScriptPlace | undefined {
  return step ? { step, ...(label ? { label } : {}) } : undefined;
}

function list(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 200) : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
