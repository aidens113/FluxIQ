// What each earlier judged trial of a build advised, and whether the revision
// now asked about changed what that advice named (t752,
// `../contracts/earlier-advice.ts`).
//
// **Why.** A build test's judges saw only the trial in front of them. In a
// breadth rerun, the first whole test was judged no and its judge advised one
// change to a read's condition; the next revision made exactly that change and
// stored exactly the rows asked for, and its judges answered no for that very
// change. The judge request carried nothing of the earlier trial. The gate that
// keeps a build's trials now keeps, per judged trial with advice, that advice
// as the builder was shown it, Core's record of the trial and the plan that ran
// (`../../flow-bootstrap/candidate/earlier-advice-memory.ts`), and hands the
// next trial's judge what this module makes of them.
//
// **What Core measures, and only that.** The conditions and steps an advice
// names: node ids found whole (`../refuted-no/node-ids.ts`), among those of
// Core's record and any the advice writes in a node id's form, and condition
// numbers (`../refuted-no/condition-references.ts`), each resolved to one
// condition of a step the advice names, or, where it names no step, to the one
// condition of Core's record with that number. A node id carries a hash that
// changes between revisions, so a step is matched by its stable suffix, its
// subflow's and its own key, as `./written-conditions.ts` finds it. A
// condition is followed `changed` where the plan now asked about no longer
// writes it as the earlier plan did, anywhere (so a list renumbered by another
// change still writes it); a step named without a condition, where its
// parameters differ. `unknown` where nothing resolved. Never a model's reading:
// whether the change was right stays the judges'.

import type { AutomationStudioResultEarlierAdvice } from "../contracts/index.ts";
import { automationStudioResultConditionReferences, automationStudioResultNodeIdsSaid } from "../refuted-no/index.ts";
import { automationStudioResultStandingNoRecordOf as recordOf } from "./record-shape.ts";
import {
  automationStudioResultWrittenCondition as writtenCondition,
  automationStudioResultWrittenConditions as writtenConditions,
  automationStudioResultWrittenStep as writtenStep,
  automationStudioResultWrittenSteps as writtenSteps,
  type AutomationStudioResultConditionPlan
} from "./written-conditions.ts";

/** A node id as a built Flow writes it (`../../flow-bootstrap/adaptation.ts`): `node.bootstrap.<hash>.<subflow>.<step>`. */
const NODE_ID = /\bnode\.bootstrap\.[\p{L}\p{N}_-]+(?:\.[\p{L}\p{N}_-]+)+/gu;
/** The hash part of such an id, before its stable suffix. */
const HASHED = /^node\.bootstrap\.[^.]+\.(.+)$/u;
/** How a saved answer's condition is named among a read's (`../refuted-no/record-conditions.ts`). */
const PROCESSING = "recordOutput.process.where ";

/** One judged trial with advice, as the gate kept it. */
type Trial = { revision: number; verdict: "no" | "unsure"; advice: string; standingNo?: unknown; plan?: AutomationStudioResultConditionPlan | undefined };
/** One condition or step an advice named, resolved in the plan that ran. */
type Named = { name: string; changed: boolean };

/** What the judge of `revision`'s trial is told of the build's earlier judged trials (header): oldest first, every earlier revision. */
export function automationStudioResultEarlierAdvice(input: { trials: readonly Trial[]; revision: number; plan: AutomationStudioResultConditionPlan | undefined }): AutomationStudioResultEarlierAdvice[] {
  return input.trials.map((trial) => {
    const named = resolved(trial, input.plan);
    const followed = !named.length ? "unknown" : named.some((one) => one.changed) ? "changed" : "unchanged";
    return {
      revision: trial.revision, verdict: trial.verdict, advice: trial.advice, followed,
      ...(named.length ? { named: named.map((one) => one.name) } : {}),
      said: said(trial, input.revision, named)
    };
  });
}

/** The conditions and steps the trial's advice names, each with whether `plan` changed it (header); none where nothing resolved. */
function resolved(trial: Trial, plan: AutomationStudioResultConditionPlan | undefined): Named[] {
  if (!trial.plan) return [];
  const conditions = recordOf(trial.standingNo)?.conditions ?? [];
  const known = [...conditions.flatMap((condition) => (condition.nodeId ? [condition.nodeId] : [])), ...(trial.advice.match(NODE_ID) ?? [])];
  const { ids, text } = automationStudioResultNodeIdsSaid(trial.advice, known);
  const processing = trial.advice.includes(PROCESSING.trim());
  const ofRecord = conditions.filter((condition) => condition.nodeId && condition.number && condition.name.startsWith(PROCESSING) === processing);
  const named: Named[] = [];
  const withCondition = new Set<string>();
  for (const number of automationStudioResultConditionReferences(text)) {
    const steps = ids.length ? ids : [...new Set(ofRecord.filter((condition) => condition.number === number).map((condition) => condition.nodeId!))];
    if (!ids.length && steps.length !== 1) continue;
    for (const nodeId of steps) {
      const recorded = ofRecord.find((condition) => condition.number === number && suffix(condition.nodeId!) === suffix(nodeId));
      const name = recorded?.name ?? `${processing ? PROCESSING : ""}condition ${number}`;
      const before = writtenCondition(trial.plan, { name, nodeId, number });
      if (before === undefined) continue;
      withCondition.add(suffix(nodeId));
      named.push({ name: `${bounded(name)} of step ${suffix(nodeId)}`, changed: !writtenConditions(plan).has(before) });
    }
  }
  for (const nodeId of ids.filter((id) => !withCondition.has(suffix(id)))) {
    const before = writtenStep(trial.plan, nodeId);
    if (before === undefined) continue;
    const now = writtenStep(plan, nodeId);
    named.push({ name: `step ${suffix(nodeId)}`, changed: now !== undefined ? now !== before : !writtenSteps(plan).has(before) });
  }
  return named;
}

/** A step's stable suffix: its node id without the hash that changes between revisions (header). */
function suffix(nodeId: string): string {
  return HASHED.exec(nodeId)?.[1] ?? nodeId;
}

/** A condition's name, as Core's record gives it or as the advice numbered it, bounded. */
function bounded(name: string): string {
  return name.length > 160 ? `${name.slice(0, 157)}...` : name;
}

/** Core's sentence for the judge (header). Generic words. */
function said(trial: Trial, revision: number, named: readonly Named[]): string {
  const advice = /[.!?]$/u.test(trial.advice.trim()) ? trial.advice.trim() : `${trial.advice.trim()}.`;
  const told = `After the trial of revision ${trial.revision} (judged ${trial.verdict}) the judge advised: ${advice} `;
  if (!named.length) return `${told}Core could not tell which conditions or steps that advice names, so whether revision ${revision} followed it is not known.`;
  const changed = named.filter((one) => one.changed).map((one) => one.name);
  const left = named.filter((one) => !one.changed).map((one) => one.name);
  const parts = [
    ...(changed.length ? [`Revision ${revision} changed ${listed(changed)}, which that advice named.`] : []),
    ...(left.length ? [`${changed.length ? "It" : `Revision ${revision}`} left ${listed(left)} as revision ${trial.revision} wrote ${left.length === 1 ? "it" : "them"}, though that advice named ${left.length === 1 ? "it" : "them"}.`] : [])
  ];
  return `${told}${parts.join(" ")}`;
}

function listed(names: readonly string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}
