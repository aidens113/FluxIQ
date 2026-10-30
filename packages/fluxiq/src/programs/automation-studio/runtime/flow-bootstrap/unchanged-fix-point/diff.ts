// What differs between a submitted Flow and the refuted one, at step level (P1a item 3).
//
// The first `candidate.unchanged_after_no` used to give only the judge's finding, so a model that had
// changed a name or a saved list's `datasetId` had to echo its whole state to find out that nothing
// it did counted. This names what differs -- the Flow's or a step's reworded label, a renamed
// `datasetId`, a step whose behaviour differs, steps added or removed -- from the two plans alone,
// numbering steps in order across the Flow's subflows from 1. Generic words, naming no site or task.

import type { JsonObject, JsonValue } from "../../../../../core/index.ts";
import type { AutomationStudioFlowBuildPlan } from "../plan/index.ts";

type Step = { label: string; behaviour: string; datasetId: string | undefined };

/** The steps of a plan in order across its subflows. */
function stepsOf(buildPlan: AutomationStudioFlowBuildPlan): Step[] {
  return buildPlan.plan.subflows.flatMap((subflow) => subflow.nodes.map((node) => {
    const { label, ...rest } = node;
    const output = node.parameters?.recordOutput;
    const record = output && typeof output === "object" && !Array.isArray(output) ? (output as JsonObject) : undefined;
    const datasetId = typeof record?.datasetId === "string" ? record.datasetId : undefined;
    const stripped = record ? { ...rest, parameters: { ...node.parameters, recordOutput: Object.fromEntries(Object.entries(record).filter(([key]) => key !== "label" && key !== "datasetId")) } } : rest;
    return { label: typeof label === "string" ? label : "", behaviour: JSON.stringify(stripped), datasetId };
  }));
}

/** What differs between the submitted plan and the refuted one: step numbers (from 1) with their words; `identical` when nothing does. */
export function automationStudioCandidatePlanDiff(submitted: AutomationStudioFlowBuildPlan, refuted: AutomationStudioFlowBuildPlan): JsonObject {
  const now = stepsOf(submitted);
  const before = stepsOf(refuted);
  const reworded: JsonValue[] = [];
  const datasetRenamed: JsonValue[] = [];
  const changed: number[] = [];
  for (let index = 0; index < Math.min(now.length, before.length); index += 1) {
    const a = now[index]!;
    const b = before[index]!;
    if (a.behaviour !== b.behaviour) changed.push(index + 1);
    if (a.label !== b.label) reworded.push({ step: index + 1, was: b.label, now: a.label });
    if (a.datasetId !== b.datasetId) datasetRenamed.push({ step: index + 1, was: b.datasetId ?? null, now: a.datasetId ?? null });
  }
  const added = Math.max(0, now.length - before.length);
  const removed = Math.max(0, before.length - now.length);
  const flowRenamed = submitted.plan.subflows.map((subflow) => subflow.name).join("\n") !== refuted.plan.subflows.map((subflow) => subflow.name).join("\n")
    || submitted.plan.router.name !== refuted.plan.router.name;
  const identical = !changed.length && !reworded.length && !datasetRenamed.length && !added && !removed && !flowRenamed;
  return {
    identical,
    ...(flowRenamed ? { flowNamesReworded: true } : {}),
    ...(reworded.length ? { stepLabelsReworded: reworded } : {}),
    ...(datasetRenamed.length ? { datasetIdRenamed: datasetRenamed } : {}),
    ...(changed.length ? { stepsBehaviourDiffers: changed } : {}),
    ...(added ? { stepsAdded: added } : {}),
    ...(removed ? { stepsRemoved: removed } : {})
  };
}
