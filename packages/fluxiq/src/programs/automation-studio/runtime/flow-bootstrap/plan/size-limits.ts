// The bounds on a Flow's size, all derived from the one setting a person
// changes: the most nodes one Subflow may hold
// (`model/flow-size/flow-size-settings.ts`).
//
// **Derived, because a bound left fixed is a node cap by another name.** A
// Subflow allowed a hundred nodes but twenty-four edges cannot hold a hundred
// connected nodes; a straight chain of seventeen nodes was refused as too deep
// at a graph depth of sixteen; a hundred real nodes do not fit in the twelve
// kilobytes one reply was allowed. So every count and byte bound that grows
// with a Flow's nodes is computed here from the setting, and nothing else in
// Flow Bootstrap holds a node count of its own. The reply profile's other
// bounds (`./limits.ts`) -- Subflows, rules, names, parameters -- bound the
// shape of a reply, not how many nodes it holds, and stay fixed.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SIZE_SETTING, automationStudioFlowMaxNodesPerSubflow, automationStudioFlowSizeSettingIssue } from "../../../model/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

/** Every size bound on one Flow, from its setting. */
export type AutomationStudioFlowBootstrapSizeLimits = {
  /** The setting itself. */
  maxNodesPerSubflow: number;
  /** Two per node: a node's success and failure ports may each be wired. */
  maxEdgesPerSubflow: number;
  /** Every Subflow full. */
  maxTotalNodes: number;
  maxTotalEdges: number;
  /** A straight chain of every node a Subflow may hold. */
  maxGraphDepth: number;
  /** A Flow's whole plan, at two kilobytes a node, never below the size it had before the setting. */
  maxPlanBytes: number;
  /** One reply's result, at one kilobyte a node of one Subflow, never below the size it had before the setting. */
  maxResultBytes: number;
};

/** Bytes a node of a whole plan is allowed: resolved parameters, locators and all. */
const PLAN_BYTES_PER_NODE = 2_048;
/** Bytes a node of one reply is allowed. The recorded thirty-step bigbox script averaged well under this. */
const RESULT_BYTES_PER_NODE = 1_024;
/** The plan budget before the setting existed; a small setting never shrinks a plan below it. */
const MIN_PLAN_BYTES = 65_536;
/** The reply budget before the setting existed. */
const MIN_RESULT_BYTES = 12_000;

/** The size bounds for a Flow allowed `maxNodesPerSubflow` nodes in each Subflow; the setting's default when omitted. */
export function automationStudioFlowBootstrapSizeLimits(
  maxNodesPerSubflow: number = AUTOMATION_STUDIO_FLOW_SIZE_SETTING.defaultValue
): AutomationStudioFlowBootstrapSizeLimits {
  const nodes = Math.max(1, Math.trunc(maxNodesPerSubflow));
  const maxTotalNodes = nodes * AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS.maxSubflows;
  return {
    maxNodesPerSubflow: nodes,
    maxEdgesPerSubflow: nodes * 2,
    maxTotalNodes,
    maxTotalEdges: maxTotalNodes * 2,
    maxGraphDepth: nodes,
    maxPlanBytes: Math.max(MIN_PLAN_BYTES, maxTotalNodes * PLAN_BYTES_PER_NODE),
    maxResultBytes: Math.max(MIN_RESULT_BYTES, nodes * RESULT_BYTES_PER_NODE)
  };
}

/** The size bounds of the Flow whose metadata this is. */
export function automationStudioFlowBootstrapSizeLimitsOf(flow: { metadata?: JsonObject | undefined }): AutomationStudioFlowBootstrapSizeLimits {
  return automationStudioFlowBootstrapSizeLimits(automationStudioFlowMaxNodesPerSubflow(flow.metadata));
}

/** The setting a size bound comes from, as a refusal names it: where it is stored, where a person changes it, and its value. */
export type AutomationStudioFlowBootstrapSizeSetting = { path: string; label: string; value: number };

/** The setting these bounds were derived from. */
export function automationStudioFlowBootstrapSizeSetting(size: AutomationStudioFlowBootstrapSizeLimits): AutomationStudioFlowBootstrapSizeSetting {
  const { path, label } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
  return { path, label, value: size.maxNodesPerSubflow };
}

/**
 * The sentence a refusal over a size bound carries: what was measured, what
 * this Flow allows, and the setting that allows it. **A refusal that names only
 * a number is one nobody can act on** -- the model cannot tell a fixed ceiling
 * from a setting, and the person cannot find where to raise it. `measured` is
 * the subject and its count, such as "Subflow has 101 nodes".
 */
export function automationStudioFlowBootstrapSizeRefusal(
  measured: string,
  limit: keyof AutomationStudioFlowBootstrapSizeLimits,
  size: AutomationStudioFlowBootstrapSizeLimits
): string {
  const { path, label } = AUTOMATION_STUDIO_FLOW_SIZE_SETTING;
  return limit === "maxNodesPerSubflow"
    ? `${measured}; this Flow allows ${size[limit]} (${path}, ${label}).`
    : `${measured}; this Flow allows ${size[limit]}, derived from ${path} = ${size.maxNodesPerSubflow} (${label}).`;
}

/**
 * The size bounds at the setting's largest value. A reader of a record written
 * earlier -- a published trace, a stored draft -- has no Flow in hand and must
 * accept anything a Flow's setting could have allowed, so it bounds by this.
 */
export function automationStudioFlowBootstrapLargestSizeLimits(): AutomationStudioFlowBootstrapSizeLimits {
  return automationStudioFlowBootstrapSizeLimits(AUTOMATION_STUDIO_FLOW_SIZE_SETTING.maximum);
}

/**
 * The size bounds a packed Bootstrap context was built for. A context built for
 * a Flow whose setting is not the default carries `maxNodesPerSubflow`
 * (`./catalog.ts`); one without it, or with a value that cannot be the setting,
 * was built at the default. Read by the provider adapters, which hold the
 * request and not the Flow.
 */
export function automationStudioFlowBootstrapSizeLimitsOfContext(context: unknown): AutomationStudioFlowBootstrapSizeLimits {
  const value = context && typeof context === "object" && !Array.isArray(context) ? (context as { maxNodesPerSubflow?: unknown }).maxNodesPerSubflow : undefined;
  return automationStudioFlowBootstrapSizeLimits(automationStudioFlowSizeSettingIssue(value) === undefined ? value as number : undefined);
}
