// Which of the evidence-guided completion's limits a result exceeded, by name.
//
// **A refusal that does not say which limit is one the model cannot act on.**
// `run-mulxsbyy-d4d4c7a1` spent its forced last decision on a completion that
// was refused `bootstrap.completion_profile_limit_exceeded` at path `result`,
// and nothing -- not the model, not the debug -- could say which of nine limits
// it was. So every limit is measured, and each one exceeded is returned with
// its name, its maximum and the value that exceeded it.
//
// **Two profiles, because two different things are being bounded.** The
// evidence limits (`./limits.ts`, `AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS`)
// bound what a model writes in one reply: twelve kilobytes of script, sixteen
// nodes to a subflow. A Flow Core assembled from the draft was not written in
// a reply at all. Its steps are nodes the build ran, carrying the resolved
// parameters each ran with, and holding that to a one-reply budget refuses the
// Flow for being real: the recorded script for `bigbox-retail-pickup-cart` is
// thirty steps, which no drafted plan could ever pass at sixteen. A drafted plan
// is held to the Flow's own limits instead (`AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS`),
// the same ones every other Flow a bootstrap builds is held to, and the summary
// -- the one thing the model still writes -- to the reply's.
import type { AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS, AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

/** One limit a completed result exceeded: which, its maximum, what it measured, and where. */
export type AutomationStudioFlowBootstrapLimitExceeded = {
  limit: string;
  max: number;
  actual: number;
  path: string;
};

/**
 * Where the plan came from. `reply`: the model wrote it, and the one-reply
 * limits apply. `draft`: Core assembled it from the steps the build ran, and
 * the Flow's own limits apply.
 */
export type AutomationStudioFlowBootstrapPlanSource = "reply" | "draft";

/** The most exceeded limits one refusal lists. */
const MAX_REPORTED = 12;

/** Every limit the result exceeds, in the order they are measured. Empty when it is within all of them. */
export function automationStudioEvidenceFlowBootstrapLimitsExceeded(
  value: { summary: string; plan: AutomationStudioFlowBootstrapPlan },
  source: AutomationStudioFlowBootstrapPlanSource = "reply"
): AutomationStudioFlowBootstrapLimitExceeded[] {
  const reply = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS;
  const flow = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_LIMITS;
  const drafted = source === "draft";
  const found: AutomationStudioFlowBootstrapLimitExceeded[] = [];
  const over = (limit: string, max: number, actual: number, path: string): void => {
    if (actual > max && found.length < MAX_REPORTED) found.push({ limit, max, actual, path });
  };
  over("maxSummaryLength", reply.maxSummaryLength, value.summary.length, "summary");
  over(drafted ? "maxPlanBytes" : "maxResultBytes", drafted ? flow.maxPlanBytes : reply.maxResultBytes, Buffer.byteLength(JSON.stringify(value), "utf8"), "result");
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
    over("maxNodesPerSubflow", drafted ? flow.maxNodesPerSubflow : reply.maxNodesPerSubflow, subflow.nodes.length, `${at}.nodes`);
    over("maxEdgesPerSubflow", drafted ? flow.maxEdgesPerSubflow : reply.maxEdgesPerSubflow, subflow.edges.length, `${at}.edges`);
    subflow.nodes.forEach((node, nodeIndex) => {
      over("maxParametersPerNode", reply.maxParametersPerNode, node.parameters ? Object.keys(node.parameters).length : 0, `${at}.nodes.${nodeIndex}.parameters`);
    });
  });
  return found;
}
