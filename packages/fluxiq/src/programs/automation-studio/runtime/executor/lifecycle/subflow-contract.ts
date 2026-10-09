// A Subflow graph's contract, read from its versioned metadata (state-aware
// recovery plan, C2).
//
// This module owns the entry, checkpoint and success-check shapes and the one
// reader of them. The interface is the graph's existing
// `interface: { inputs, outputs }` and is not repeated here; the default entry
// is the graph's Start node. Keys are named in
// `nodes/control-flow/handler-end.ts` (`AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS`).

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowNode } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS } from "../../../nodes/control-flow/index.ts";
import type { AutomationStudioFactCondition } from "./fact-condition.ts";
import { parseAutomationStudioFactConditions } from "./fact-conditions-parse.ts";

/**
 * An alternative entry, from node metadata `fluxiq.entry`. `requires` names
 * interface inputs or values that must be bound for execution to start there.
 */
export type AutomationStudioSubflowEntry = {
  id: string;
  nodeId: string;
  order: number;
  when: AutomationStudioFactCondition[];
  requires: string[];
};

/**
 * A recovery checkpoint, from node metadata `fluxiq.checkpoint`: the only
 * legal target of a Route disposition (C5). A node may be an entry and a
 * checkpoint at once.
 */
export type AutomationStudioSubflowCheckpoint = {
  id: string;
  nodeId: string;
  when: AutomationStudioFactCondition[];
  requires: string[];
};

/**
 * What one graph declares about how it may be entered and re-entered, and
 * what proves it finished. `successCheck` comes from graph metadata
 * `fluxiq.successCheck`; an empty list asks nothing. `problems` names every
 * declaration that could not be read, which the caller refuses rather than
 * runs without.
 */
export type AutomationStudioSubflowContract = {
  entries: AutomationStudioSubflowEntry[];
  checkpoints: AutomationStudioSubflowCheckpoint[];
  successCheck: AutomationStudioFactCondition[];
  problems: string[];
};

/** Reads the entries, checkpoints and success check one graph declares, entries and checkpoints in the graph's node order. */
export function automationStudioSubflowContract(graph: { nodes: readonly AutomationStudioFlowNode[]; metadata?: JsonObject }): AutomationStudioSubflowContract {
  const problems: string[] = [];
  const entries: AutomationStudioSubflowEntry[] = [];
  const checkpoints: AutomationStudioSubflowCheckpoint[] = [];
  for (const node of graph.nodes) {
    const entry = node.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry];
    if (entry !== undefined) {
      const read = declaration(entry, `nodes.${node.id}.metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.entry}`, problems);
      if (read) entries.push({ id: read.id, nodeId: node.id, order: read.order, when: read.when, requires: read.requires });
    }
    const checkpoint = node.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint];
    if (checkpoint !== undefined) {
      const read = declaration(checkpoint, `nodes.${node.id}.metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.checkpoint}`, problems);
      if (read) checkpoints.push({ id: read.id, nodeId: node.id, when: read.when, requires: read.requires });
    }
  }
  const successPath = `metadata.${AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck}`;
  const success = parseAutomationStudioFactConditions(graph.metadata?.[AUTOMATION_STUDIO_SUBFLOW_CONTRACT_KEYS.successCheck], successPath);
  problems.push(...success.problems);
  duplicateIds(entries, "entry", problems);
  duplicateIds(checkpoints, "checkpoint", problems);
  return { entries, checkpoints, successCheck: success.conditions, problems };
}

function declaration(value: JsonValue, path: string, problems: string[]): { id: string; order: number; when: AutomationStudioFactCondition[]; requires: string[] } | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    problems.push(`${path} must be an object with an id.`);
    return undefined;
  }
  const id = typeof value.id === "string" ? value.id.trim() : "";
  if (!id) {
    problems.push(`${path} must have a non-empty id.`);
    return undefined;
  }
  const when = parseAutomationStudioFactConditions(value.when, `${path}.when`);
  problems.push(...when.problems);
  const requires = Array.isArray(value.requires) ? value.requires.filter((name): name is string => typeof name === "string" && name.trim().length > 0) : [];
  if (value.requires !== undefined && (!Array.isArray(value.requires) || requires.length !== value.requires.length)) problems.push(`${path}.requires must be a list of names.`);
  const order = typeof value.order === "number" && Number.isFinite(value.order) ? value.order : 0;
  return { id, order, when: when.conditions, requires };
}

function duplicateIds(declared: readonly { id: string }[], kind: string, problems: string[]): void {
  const seen = new Set<string>();
  for (const { id } of declared) {
    if (seen.has(id)) problems.push(`Two nodes declare the ${kind} "${id}".`);
    seen.add(id);
  }
}
