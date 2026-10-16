import type { AutomationStudioFlowBootstrapPlan } from "../../flow-bootstrap/plan/index.ts";
import type { AutomationStudioSubflowScope } from "../../flow-bootstrap/subflow-candidate/index.ts";
import type { AutomationStudioProjectSubflowBrief } from "../contracts/index.ts";
import { AutomationStudioProjectRecordRefusal, type AutomationStudioProjectBuildRecord } from "../record/index.ts";
import { automationStudioProjectCallOrder } from "./call-order.ts";

// A brief mapped onto the builder's scope (`flow-bootstrap/subflow-candidate/
// contracts.ts`, which keeps plain fields so it need not wait on these
// contracts): its parts as the verbatim spans the task spec quotes, the
// subflow's interface and success check as the plan holds them, and the plan's
// other subflow keys, which no part of its proposal may be keyed as.
//
// **Which inputs another subflow hands on (t672).** A callable subflow's
// inputs that an earlier subflow of the plan hands back are the scope's
// `handedOn`, read by the one rule assembly binds the calls by
// (`./call-order.ts`): the plan's callable subflows in call order, each after
// the predecessors its latest brief under this plan named -- this brief's own
// for its subflow -- plan order between equals. A builder may leave such an
// input unread (`flow-bootstrap/subflow-candidate/callable-target.ts`); every
// other input is the person's value, which it must read.
//
// **The other parts are named (t676).** On three A8 Lab runs a builder did a
// later part's lasting act while it explored, and its passing proposal did it
// again when Core prepared the next builder's entry. The scope now carries the
// task spec's parts this brief does not hold as `outOfScope`, by id and the
// person's words, which the builder's brief names as other builders' parts
// (`flow-bootstrap/subflow-candidate/builder-loop.ts`). Words only: nothing is
// refused for doing one.

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
  // The task's other parts, each another builder's subflow, told to this one so it knows them while it explores (header, t676).
  const own = new Set(brief.parts);
  const outOfScope = spec.parts.filter((part) => !own.has(part.id)).map((part) => ({ partId: part.id, text: part.quote.text }));
  if (outOfScope.length) scope.outOfScope = outOfScope;
  if (brief.interface) scope.interface = structuredClone(brief.interface);
  const handedOn = brief.interface ? handedOnInputs(record, brief, plan.plan) : [];
  if (handedOn.length) scope.handedOn = handedOn;
  const successCheck = subflow.metadata?.["fluxiq.successCheck"];
  if (successCheck) scope.successCheck = structuredClone(successCheck);
  return {
    scope,
    siblings: plan.plan.subflows.map((candidate) => candidate.key).filter((key) => key !== brief.subflowKey),
    subflowName: subflow.name
  };
}

/** The brief's inputs an earlier callee hands on, by the call order assembly binds by (header); none when the order is a circle. */
function handedOnInputs(record: AutomationStudioProjectBuildRecord, brief: AutomationStudioProjectSubflowBrief, plan: AutomationStudioFlowBootstrapPlan): string[] {
  const predecessors = new Map<string, readonly string[]>();
  for (const { brief: recorded } of record.briefs) if (recorded.planDigest === brief.planDigest) predecessors.set(recorded.subflowKey, recorded.entry.predecessors);
  predecessors.set(brief.subflowKey, brief.entry.predecessors);
  const ordered = automationStudioProjectCallOrder(plan.subflows.filter((subflow) => subflow.interface), predecessors);
  const own = ordered?.find((call) => call.subflow.key === brief.subflowKey);
  return (own?.inputs ?? []).filter((input) => input.from !== undefined).map((input) => input.id);
}
