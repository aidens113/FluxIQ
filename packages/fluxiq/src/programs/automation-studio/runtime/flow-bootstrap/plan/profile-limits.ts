// Which of the evidence-guided completion's limits a result exceeded, by name.
//
// **A refusal that does not say which limit is one the model cannot act on.**
// `run-mulxsbyy-d4d4c7a1` spent its forced last decision on a completion that
// was refused `bootstrap.completion_profile_limit_exceeded` at path `result`,
// and nothing -- not the model, not the debug -- could say which of nine limits
// it was. So every limit is measured, and each one exceeded is returned with
// its name, its maximum and the value that exceeded it.
//
// **Two profiles, because two different things are being bounded.** A reply
// is what a model writes in one call; a draft is a Flow Core assembled from the
// steps the build ran, carrying the resolved parameters each ran with. Neither
// is held to a node count of its own any more. Both are held to the Flow's size
// setting (`./size-limits.ts`): a reply's nodes and edges to the Subflow bound
// and its bytes to the reply bound derived from it, a draft's nodes and edges
// to the same Subflow bound and its bytes to the whole plan's. A reply held to
// sixteen nodes refused the recorded thirty-step `bigbox-retail-pickup-cart`
// script for being real, and a draft held to sixty-four refused a larger one
// the same way. What stays fixed is the shape of a reply -- its Subflows,
// rules, names and parameters (`./limits.ts`) -- which does not grow with a
// Flow, and the summary, the one thing the model still writes, to the reply's.
//
// A limit that comes from the setting is reported with it (`setting`), so a
// refusal says where the bound can be raised as well as what it was.
import type { AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";
import {
  automationStudioFlowBootstrapSizeLimits,
  automationStudioFlowBootstrapSizeSetting,
  type AutomationStudioFlowBootstrapSizeLimits,
  type AutomationStudioFlowBootstrapSizeSetting
} from "./size-limits.ts";

/** One limit a completed result exceeded: which, its maximum, what it measured, where, and the setting it comes from when it does. */
export type AutomationStudioFlowBootstrapLimitExceeded = {
  limit: string;
  max: number;
  actual: number;
  path: string;
  /** Present when the limit is the Flow's size setting or derived from it. */
  setting?: AutomationStudioFlowBootstrapSizeSetting;
};

/**
 * Where the plan came from. `reply`: the model wrote it, and the one-reply
 * limits apply. `draft`: Core assembled it from the steps the build ran, and
 * the Flow's own limits apply.
 */
export type AutomationStudioFlowBootstrapPlanSource = "reply" | "draft";

/** Every limit the result exceeds, in the order they are measured. Empty when it is within all of them. */
export function automationStudioEvidenceFlowBootstrapLimitsExceeded(
  value: { summary: string; plan: AutomationStudioFlowBootstrapPlan },
  source: AutomationStudioFlowBootstrapPlanSource = "reply",
  size: AutomationStudioFlowBootstrapSizeLimits = automationStudioFlowBootstrapSizeLimits()
): AutomationStudioFlowBootstrapLimitExceeded[] {
  const reply = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS;
  const flow = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS;
  const drafted = source === "draft";
  const setting = automationStudioFlowBootstrapSizeSetting(size);
  const found: AutomationStudioFlowBootstrapLimitExceeded[] = [];
  const over = (limit: string, max: number, actual: number, path: string, sized = false): void => {
    if (actual > max) found.push({ limit, max, actual, path, ...(sized ? { setting } : {}) });
  };
  over("maxSummaryLength", reply.maxSummaryLength, value.summary.length, "summary");
  over(drafted ? "maxPlanBytes" : "maxResultBytes", drafted ? size.maxPlanBytes : size.maxResultBytes, Buffer.byteLength(JSON.stringify(value), "utf8"), "result", true);
  over("maxNameLength", reply.maxNameLength, value.plan.router.name.length, "plan.router.name");
  over("maxRules", reply.maxRules, value.plan.router.rules.length, "plan.router.rules");
  value.plan.router.rules.forEach((rule, index) => {
    over("maxNameLength", reply.maxNameLength, rule.name.length, `plan.router.rules.${index}.name`);
    over("maxRouteTags", reply.maxRouteTags, rule.routeTags.length, `plan.router.rules.${index}.routeTags`);
  });
  over("maxSubflows", drafted ? flow.maxSubflows : reply.maxSubflows, value.plan.subflows.length, "plan.subflows");
  value.plan.subflows.forEach((subflow, index) => {
    const at = `plan.subflows.${index}`;
    over("maxNameLength", reply.maxNameLength, subflow.name.length, `${at}.name`);
    over("maxNodesPerSubflow", size.maxNodesPerSubflow, subflow.nodes.length, `${at}.nodes`, true);
    over("maxEdgesPerSubflow", size.maxEdgesPerSubflow, subflow.edges.length, `${at}.edges`, true);
    subflow.nodes.forEach((node, nodeIndex) => {
      over("maxParametersPerNode", reply.maxParametersPerNode, node.parameters ? Object.keys(node.parameters).length : 0, `${at}.nodes.${nodeIndex}.parameters`);
    });
  });
  return found;
}
