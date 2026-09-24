// Reading a plan the model wrote as JSON, as leniently as a Flow script is read.
//
// The JSON shape is still accepted, and every captured live reply is in it, so
// nothing that worked stops working. What changes is that the parts the model
// used to have to keep consistent with itself are derived instead: a missing
// schema version, a Subflow's key and role, a node's key and definition
// version, the output action a definition fixes, and the edges between
// consecutive nodes when it wrote none. A value the model put at the node's top
// level rather than inside `parameters` is moved to the parameter it names.
//
// What the model did write is kept. Keys it chose are kept where they are
// usable, so the edges it wrote still point at the nodes it meant; a key that
// is not a usable symbol is replaced and every edge naming it is moved with it.
import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type {
  AutomationStudioNodeDefinition,
  AutomationStudioNodeRegistry,
  AutomationStudioNodeRegistryResolution
} from "../../../nodes/index.ts";
import type {
  AutomationStudioFlowBootstrapEdge,
  AutomationStudioFlowBootstrapIssue,
  AutomationStudioFlowBootstrapNode,
  AutomationStudioFlowBootstrapPlan,
  AutomationStudioFlowBootstrapSubflow
} from "../plan/index.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "../plan/index.ts";
import { derivedOutputActionId } from "./assemble.ts";
import { readAuthoringConsequences } from "./consequences.ts";
import { authoringError } from "./issue.ts";
import { authoringKey, authoringSymbol } from "./keys.ts";
import { matchAuthoringDefinition, matchAuthoringParameter } from "./matching.ts";
import { normaliseAuthoringNodeParameters } from "./normalise.ts";
import { AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY, isJsonObject } from "./values.ts";

const NAME_LIMIT = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxNameLength;
const NODE_LIST_KEYS = ["nodes", "steps", "actions"];
const RESERVED_NODE_KEYS = new Set(["key", "id", "name", "definitionid", "definition", "node", "definitionversion", "version", "parameters", "params", "outputactionid", "outputaction", "outputid", "position", "label", "description", "summary"]);

export function normaliseAutomationStudioFlowBootstrapJsonPlan(input: {
  value: JsonValue;
  registry: AutomationStudioNodeRegistry;
  resolution: AutomationStudioNodeRegistryResolution;
  summary: string;
}): { plan?: AutomationStudioFlowBootstrapPlan; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  if (!isJsonObject(input.value)) {
    issues.push(authoringError("bootstrap.invalid_plan", "Bootstrap plan must be an object.", "plan"));
    return { issues };
  }
  const definitions = input.registry.list(input.resolution);
  const written = subflowList(input.value);
  if (!written.length) {
    issues.push(authoringError("bootstrap.invalid_subflows", "Bootstrap subflows must be an array.", "plan.subflows"));
    return { issues };
  }
  const keys = uniqueSymbols(written.map((subflow, index) => symbolOf(subflow, index)));
  const subflows: AutomationStudioFlowBootstrapSubflow[] = [];
  for (const [index, subflow] of written.entries()) {
    const path = `plan.subflows.${index}`;
    const built = buildSubflow({ written: subflow, definitions, key: keys[index]!, index, path });
    issues.push(...built.issues);
    if (built.subflow) subflows.push(built.subflow);
  }
  // Only the shape complaint is the shape complaint. A plan that wrote subflows
  // and had them all refused is a different failure, and saying "must be an
  // array" to a model that wrote one is how the loop above began: the sentence
  // named nothing the model could change. The subflows' own issues now carry
  // the reason, so nothing is added on top of them.
  if (!subflows.length || issues.some((issue) => issue.severity === "error")) {
    if (!subflows.length && !issues.length) {
      issues.push(authoringError("bootstrap.invalid_subflows", "Bootstrap subflows must be an array.", "plan.subflows"));
    }
    return { issues };
  }
  if (!subflows.some((subflow) => subflow.role === "primary")) subflows[0]!.role = "primary";
  const primary = subflows.find((subflow) => subflow.role === "primary")!.key;
  return { plan: { schemaVersion: "0.1", router: router(input.value.router, subflows, input.summary, primary), subflows }, issues };
}

function subflowList(plan: JsonObject): JsonObject[] {
  const written = plan.subflows;
  if (Array.isArray(written)) return written.filter(isJsonObject);
  if (isJsonObject(written)) return [written];
  for (const key of NODE_LIST_KEYS) if (Array.isArray(plan[key])) return [plan];
  return [];
}

function symbolOf(subflow: JsonObject, index: number): string {
  const written = typeof subflow.key === "string" ? subflow.key : typeof subflow.name === "string" ? subflow.name : "";
  return authoringSymbol(written) ?? (index === 0 ? "main" : `subflow${index}`);
}

function buildSubflow(input: {
  written: JsonObject;
  definitions: readonly AutomationStudioNodeDefinition[];
  key: string;
  index: number;
  path: string;
}): { subflow?: AutomationStudioFlowBootstrapSubflow; issues: AutomationStudioFlowBootstrapIssue[] } {
  const issues: AutomationStudioFlowBootstrapIssue[] = [];
  const writtenNodes = NODE_LIST_KEYS.map((key) => input.written[key]).find(Array.isArray) ?? [];
  const nodes: AutomationStudioFlowBootstrapNode[] = [];
  const renamed = new Map<string, string>();
  const definitionByKey = new Map<string, AutomationStudioNodeDefinition>();
  for (const [index, value] of writtenNodes.entries()) {
    const nodePath = `${input.path}.nodes.${index}`;
    if (!isJsonObject(value)) {
      issues.push(authoringError("bootstrap.invalid_node", "Bootstrap node must be an object.", nodePath));
      continue;
    }
    const found = matchAuthoringDefinition(definitionText(value), input.definitions);
    if (!found.definition) {
      issues.push(authoringError("bootstrap.definition_unavailable", found.candidates.length
        ? `Node definition is missing or unavailable in this Flow scope; nodeCatalog offers ${found.candidates.join(", ")}.`
        : "Node definition is missing or unavailable in this Flow scope.", `${nodePath}.definitionId`));
      continue;
    }
    const wrote = typeof value.key === "string" ? value.key : typeof value.id === "string" ? value.id : "";
    const key = uniqueSymbols([...nodes.map((node) => node.key), authoringSymbol(wrote) ?? `s${index + 1}`]).at(-1)!;
    if (wrote) renamed.set(wrote, key);
    const normalised = normaliseAuthoringNodeParameters({
      definition: found.definition,
      written: writtenParameters(value, found.definition),
      path: nodePath,
      fallbackName: typeof value.name === "string" ? value.name : found.definition.label
    });
    issues.push(...normalised.issues);
    const outputActionId = typeof value.outputActionId === "string" && value.outputActionId
      ? value.outputActionId
      : derivedOutputActionId(found.definition);
    nodes.push({
      key,
      definitionId: found.definition.id,
      definitionVersion: found.definition.version,
      ...(Object.keys(normalised.parameters).length ? { parameters: normalised.parameters } : {}),
      ...(outputActionId ? { outputActionId } : {}),
      // The step's own declaration of what it would lastingly do, whether it
      // came as a field of the node or rode in with its keys.
      ...(nodeConsequences(value) ?? normalised.consequences ? { consequences: (nodeConsequences(value) ?? normalised.consequences)! } : {})
    });
    definitionByKey.set(key, found.definition);
  }
  // A subflow that produced no node says so, and this is the one return that
  // used to say nothing at all. `writtenNodes` reads `nodes`, `steps` or
  // `actions` and nothing else, so a model that put its list under any other
  // name reached here with an empty list and no issue raised against it -- the
  // subflow vanished, and the caller then reported "Bootstrap subflows must be
  // an array" to a model that had written an array. It could not act on that,
  // so it wrote the same plan again.
  //
  // Measured on 2026-09-24: `data-table-inventory-empty` spent 24 of its build
  // steps on `bootstrap.invalid_subflows`, `admin-console-customer-book-short`
  // 16, `product-catalog-first-page-sparse-cards` 15, and
  // `company-directory-register-page` 12 before dying after 44 provider calls.
  // Four of the extract lane's eight failures, one silent return.
  //
  // The empty list and the list whose nodes all failed are different problems,
  // so they are different sentences: the first names the keys a node list may
  // be written under, and the second leaves the nodes' own issues to speak,
  // because they already say which node and why.
  if (!nodes.length) {
    if (!writtenNodes.length) {
      issues.push(authoringError("bootstrap.subflow_has_no_nodes", `Subflow ${input.key} lists no nodes; write them under ${NODE_LIST_KEYS.join(", ")}.`, `${input.path}.nodes`));
    } else if (!issues.length) {
      issues.push(authoringError("bootstrap.subflow_has_no_nodes", `Subflow ${input.key} has ${writtenNodes.length} node(s) and none could be built.`, `${input.path}.nodes`));
    }
    return { issues };
  }
  const edges = buildEdges(input.written.edges, nodes, renamed, definitionByKey);
  return {
    subflow: {
      key: input.key,
      name: bounded(typeof input.written.name === "string" ? input.written.name : input.key, NAME_LIMIT),
      role: role(input.written.role, input.index),
      nodes,
      edges
    },
    issues
  };
}

function definitionText(node: JsonObject): string {
  for (const key of ["definitionId", "definition", "node", "nodeId", "type"]) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return typeof node.name === "string" ? node.name : "";
}

/** Every value the model wrote for a node, wherever it wrote it. */
function writtenParameters(node: JsonObject, definition: AutomationStudioNodeDefinition): Record<string, JsonValue> {
  const written: Record<string, JsonValue> = {};
  const declared = node.parameters ?? node.params;
  if (isJsonObject(declared)) for (const [key, value] of Object.entries(declared)) written[key] = value;
  const misplaced: JsonObject = {};
  for (const [key, value] of Object.entries(node)) {
    if (RESERVED_NODE_KEYS.has(authoringKey(key))) continue;
    if (key === AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY || authoringKey(key) === "location") {
      misplaced[key] = value;
      continue;
    }
    if (matchAuthoringParameter(key, definition) && written[key] === undefined) written[key] = value;
  }
  const handle = misplaced[AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY];
  if (typeof handle === "string") {
    const candidates = definition.parameters.filter((parameter) => (parameter.valueType === "object" || parameter.valueType === "json") && parameter.ui?.control !== "record-output");
    const only = candidates.length === 1 ? candidates[0] : candidates.find((parameter) => authoringKey(parameter.id) === "target");
    if (only && written[only.id] === undefined) written[only.id] = misplaced;
    else written[AUTOMATION_STUDIO_AUTHORING_HANDLE_KEY] = handle;
  }
  return written;
}

function buildEdges(
  written: JsonValue | undefined,
  nodes: readonly AutomationStudioFlowBootstrapNode[],
  renamed: ReadonlyMap<string, string>,
  definitions: ReadonlyMap<string, AutomationStudioNodeDefinition>
): AutomationStudioFlowBootstrapEdge[] {
  const keys = new Set(nodes.map((node) => node.key));
  const named = (value: string): string | undefined => renamed.get(value) ?? (keys.has(value) ? value : undefined);
  const resolve = (value: JsonValue | undefined): { nodeKey?: string; portId?: string } => {
    if (typeof value === "string") {
      const nodeKey = named(value);
      return nodeKey ? { nodeKey } : {};
    }
    if (!isJsonObject(value)) return {};
    const node = value.nodeKey ?? value.node ?? value.key;
    const port = value.portId ?? value.port;
    const nodeKey = typeof node === "string" ? named(node) : undefined;
    return {
      ...(nodeKey ? { nodeKey } : {}),
      ...(typeof port === "string" && port ? { portId: port } : {})
    };
  };
  const edges: AutomationStudioFlowBootstrapEdge[] = [];
  if (Array.isArray(written)) {
    for (const item of written) {
      if (!isJsonObject(item)) continue;
      const source = resolve(item.source ?? item.from);
      const target = resolve(item.target ?? item.to);
      if (!source.nodeKey || !target.nodeKey) continue;
      const sourcePort = source.portId ?? definitions.get(source.nodeKey)?.outputs[0]?.id;
      const targetPort = target.portId ?? definitions.get(target.nodeKey)?.inputs[0]?.id;
      if (!sourcePort || !targetPort) continue;
      edges.push({ key: `e${edges.length + 1}`, source: { nodeKey: source.nodeKey, portId: sourcePort }, target: { nodeKey: target.nodeKey, portId: targetPort } });
    }
  }
  if (edges.length || nodes.length < 2) return edges;
  for (const [index, node] of nodes.entries()) {
    const next = nodes[index + 1];
    if (!next) break;
    const sourcePort = definitions.get(node.key)?.outputs[0]?.id;
    const targetPort = definitions.get(next.key)?.inputs[0]?.id;
    if (!sourcePort || !targetPort) continue;
    edges.push({ key: `e${edges.length + 1}`, source: { nodeKey: node.key, portId: sourcePort }, target: { nodeKey: next.key, portId: targetPort } });
  }
  return edges;
}

function router(
  written: JsonValue | undefined,
  subflows: readonly AutomationStudioFlowBootstrapSubflow[],
  summary: string,
  primary: string
): AutomationStudioFlowBootstrapPlan["router"] {
  const keys = new Set(subflows.map((subflow) => subflow.key));
  const source = isJsonObject(written) ? written : {};
  const rules = (Array.isArray(source.rules) ? source.rules : []).flatMap((rule, index) => {
    if (!isJsonObject(rule)) return [];
    const target = typeof rule.targetSubflowKey === "string" ? authoringSymbol(rule.targetSubflowKey) : undefined;
    if (!target || !keys.has(target)) return [];
    const tags = Array.isArray(rule.routeTags) ? rule.routeTags.filter((tag): tag is string => typeof tag === "string" && tag.length > 0).slice(0, 8) : [];
    return [{
      key: `r${index + 1}`,
      name: bounded(typeof rule.name === "string" ? rule.name : target, NAME_LIMIT),
      targetSubflowKey: target,
      routeTags: tags.map((tag) => tag.slice(0, 100))
    }];
  });
  const fallback = isJsonObject(source.fallback) && source.fallback.kind === "fail"
    ? { kind: "fail" as const }
    : { kind: "subflow" as const, targetSubflowKey: primary };
  return { name: bounded(typeof source.name === "string" ? source.name : summary, NAME_LIMIT), rules, fallback };
}

function role(written: JsonValue | undefined, index: number): AutomationStudioFlowBootstrapSubflow["role"] {
  const roles = ["primary", "integration", "recovery", "fallback", "utility"] as const;
  const match = roles.find((candidate) => candidate === authoringKey(String(written ?? "")));
  return match ?? (index === 0 ? "primary" : "utility");
}

function uniqueSymbols(candidates: string[]): string[] {
  const seen = new Set<string>();
  return candidates.map((candidate, index) => {
    let key = candidate;
    while (seen.has(key)) key = `${candidate}-${index}`.slice(0, 64);
    seen.add(key);
    return key;
  });
}

function bounded(text: string, limit: number): string {
  const trimmed = text.replace(/\s+/gu, " ").trim();
  return (trimmed || "Flow").slice(0, limit);
}

/** A nested plan node's own consequence declaration, when it wrote one. */
function nodeConsequences(value: Record<string, unknown>): string[] | undefined {
  return readAuthoringConsequences(value.consequences);
}
