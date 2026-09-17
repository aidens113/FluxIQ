// What an evidence-guided Bootstrap call asks a model to return, and the limit
// check the plan built from it must pass.
//
// It used to ask for the whole plan as nested JSON: router, subflows, nodes,
// edges, endpoints, keys, versions and ids, every one of which the model had to
// keep consistent with every other while it wrote. In the first full creation
// campaign most refused builds failed on that shape rather than on the
// reasoning -- an unknown record-output key, a dataset id with a space in it, a
// handle one level from where it belonged. So the call now asks for the Flow as
// plain lines (`./flow-script-format.ts`), which has no brackets to balance and
// nothing to escape, and Core derives the rest.
//
// The reply is still read strictly: `../authoring/accept.ts` turns it into a
// plan, and that plan goes through the same parser, the same registry
// validation and the same record-set contract as before. Nothing a created
// Flow may contain was widened.
import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT } from "./flow-script-format.ts";
import type { AutomationStudioFlowBootstrapPlan } from "./contracts.ts";
import { AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS } from "./limits.ts";

/**
 * The completion an evidence-guided Bootstrap call returns: one line-oriented
 * Flow script, and one sentence about it.
 *
 * The nested plan shape is still accepted by the acceptor, so a model that
 * returns one -- and every reply captured before this existed -- still builds.
 * It is no longer advertised, because advertising it is what made it the shape
 * models reached for.
 */
export const AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_COMPLETION_SCHEMA: JsonObject = {
  type: "object",
  additionalProperties: false,
  required: ["flow"],
  description: `Return the finished Flow under "flow" and one sentence about it under "summary". ${AUTOMATION_STUDIO_FLOW_SCRIPT_FORMAT}`,
  properties: {
    summary: { type: "string", minLength: 1, maxLength: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxSummaryLength },
    flow: {
      type: "string",
      minLength: 1,
      maxLength: AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS.maxResultBytes,
      description: "The Flow as plain lines, one `key: value` per line, in the order the steps run."
    }
  }
};

export function isAutomationStudioEvidenceFlowBootstrapResultWithinLimits(value: { summary: string; plan: AutomationStudioFlowBootstrapPlan }): boolean {
  const limits = AUTOMATION_STUDIO_EVIDENCE_FLOW_BOOTSTRAP_LIMITS;
  return value.summary.length <= limits.maxSummaryLength
    && Buffer.byteLength(JSON.stringify(value), "utf8") <= limits.maxResultBytes
    && value.plan.router.name.length <= limits.maxNameLength
    && value.plan.router.rules.length <= limits.maxRules
    && value.plan.router.rules.every((rule) => rule.name.length <= limits.maxNameLength && rule.routeTags.length <= limits.maxRouteTags)
    && value.plan.subflows.length <= limits.maxSubflows
    && value.plan.subflows.every((subflow) => subflow.name.length <= limits.maxNameLength
      && subflow.nodes.length <= limits.maxNodesPerSubflow
      && subflow.edges.length <= limits.maxEdgesPerSubflow
      && subflow.nodes.every((node) => !node.parameters || Object.keys(node.parameters).length <= limits.maxParametersPerNode));
}
