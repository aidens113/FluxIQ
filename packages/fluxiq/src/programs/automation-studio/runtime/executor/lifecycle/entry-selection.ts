// Where a new invocation begins (state-aware recovery plan, C2).
//
// This module owns entry selection as a pure decision over facts the host has
// already answered. It runs at invocation (after On Start) and at Route
// dispositions only, never after an ordinary success; the node it picks still
// passes its readiness gate and On Before.

import type { AutomationStudioFactConditionResult, AutomationStudioFactTruth } from "./fact-condition.ts";
import { automationStudioFactConditionsHold } from "./fact-conditions-hold.ts";
import type { AutomationStudioSubflowEntry } from "./subflow-contract.ts";

/** Why one alternative entry was or was not taken, for the frame's first attempt trace. */
export type AutomationStudioEntryConsideration = {
  id: string;
  nodeId: string;
  when: AutomationStudioFactTruth;
  /** `requires` names that were not bound. */
  unbound: string[];
};

/** The entry chosen and what was weighed. `default` carries the graph's Start node, or nothing when the caller has none. */
export type AutomationStudioEntrySelection =
  | { kind: "entry"; id: string; nodeId: string; considered: AutomationStudioEntryConsideration[] }
  | { kind: "default"; nodeId: string | undefined; considered: AutomationStudioEntryConsideration[] };

/**
 * Takes the first alternative entry, by ascending `order` and then the order
 * the graph lists them in, whose `when` conditions are all `true` and whose
 * `requires` names are all bound; otherwise the default entry.
 *
 * `whenResults` holds the host's batched answers per entry id, by position
 * (see `automationStudioFactConditionsHold`). An entry with no answers for a
 * condition, or with an `unknown` one, is not eligible: `unknown` is never
 * `true`.
 */
export function selectAutomationStudioEntry(input: {
  entries: readonly AutomationStudioSubflowEntry[];
  defaultNodeId: string | undefined;
  whenResults: ReadonlyMap<string, readonly (AutomationStudioFactConditionResult | undefined)[]>;
  bound: ReadonlySet<string>;
}): AutomationStudioEntrySelection {
  const ordered = input.entries.map((entry, index) => ({ entry, index })).sort((left, right) => left.entry.order - right.entry.order || left.index - right.index);
  const considered: AutomationStudioEntryConsideration[] = [];
  for (const { entry } of ordered) {
    const when = automationStudioFactConditionsHold(entry.when, input.whenResults.get(entry.id) ?? []);
    const unbound = entry.requires.filter((name) => !input.bound.has(name));
    considered.push({ id: entry.id, nodeId: entry.nodeId, when, unbound });
    if (when === "true" && !unbound.length) return { kind: "entry", id: entry.id, nodeId: entry.nodeId, considered };
  }
  return { kind: "default", nodeId: input.defaultNodeId, considered };
}
