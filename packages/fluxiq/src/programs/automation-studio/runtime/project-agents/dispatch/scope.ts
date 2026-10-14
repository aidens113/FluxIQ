import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildRecord } from "../record/index.ts";

// A brief mapped onto the builder's scope (`flow-bootstrap/subflow-candidate/
// contracts.ts`, which keeps plain fields so it need not wait on these
// contracts): its parts as the verbatim spans the task spec quotes, the
// subflow's interface and success check as the plan holds them, and the plan's
// other subflow keys, which no part of its proposal may be keyed as.

export type AutomationStudioProjectDispatchScope = {
  scope: AutomationStudioSubflowScope;
  siblings: string[];
  /** The subflow's name in the plan, for the chat's lane. */
  subflowName: string;
};

/** The brief's scope under the record's latest plan; refuses a brief written against an older one. */
export function automationStudioProjectDispatchScope(record: AutomationStudioProjectBuildRecord, brief: AutomationStudioProjectSubflowBrief): AutomationStudioProjectDispatchScope {
  const plan = record.plans.at(-1)?.plan;
  if (!plan || plan.digest !== brief.planDigest) throw new AutomationStudioProjectRecordRefusal("project.brief_plan_stale", "brief.planDigest");
  const spec = record.taskSpecs.find((entry) => entry.taskSpec.digest === plan.taskSpecDigest)?.taskSpec;
  if (!spec) throw new AutomationStudioProjectRecordRefusal("project.plan_task_spec_stale", "structurePlan.taskSpecDigest");
  const subflow = plan.plan.subflows.find((candidate) => candidate.key === brief.subflowKey);
  if (!subflow) throw new AutomationStudioProjectRecordRefusal("project.brief_subflow_unknown", "brief.subflowKey");
  const parts = brief.parts.map((partId, index) => {
    const part = spec.parts.find((candidate) => candidate.id === partId);
    if (!part) throw new AutomationStudioProjectRecordRefusal("project.brief_part_not_carried", `brief.parts.${index}`);
    return { partId, sourceId: part.quote.sourceId, text: part.quote.text, lastingActs: [...part.lastingActs] };
  });
  const scope: AutomationStudioSubflowScope = {
    buildId: record.buildId,
    briefId: brief.briefId,
    planDigest: brief.planDigest,
    subflowKey: brief.subflowKey,
    parts,
    predecessors: [...brief.entry.predecessors]
  };
  if (brief.interface) scope.interface = structuredClone(brief.interface);
  const successCheck = subflow.metadata?.["fluxiq.successCheck"];
  if (successCheck) scope.successCheck = structuredClone(successCheck);
  return {
    scope,
    siblings: plan.plan.subflows.map((candidate) => candidate.key).filter((key) => key !== brief.subflowKey),
    subflowName: subflow.name
  };
}
