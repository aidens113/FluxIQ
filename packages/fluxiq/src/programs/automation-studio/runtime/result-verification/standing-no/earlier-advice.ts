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
// **What Core measures, and only that (P5b).** The advice is located-only: the
// defects Core located in its record of the trial (`standingNo.located`, kind and
// row as located), in Core's words (`./earlier-advice-located.ts`), never an
// earlier judge's prose advice or a claim Core did not locate, so a later judge
// is not anchored by what an earlier one guessed. What the advice names is
// Core's own: for a located defect of a row the request asks for (`asked_missing`,
// `wrong_value`), the conditions of Core's record that alone left that row out
// (`leftOutAlone`), each found in the plan that ran by its stable suffix, its
// subflow's and its own key, as `./written-conditions.ts` finds it. A condition
// is followed `changed` where the plan now asked about no longer writes it as the
// earlier plan did, anywhere (so a list renumbered by another change still
// writes it). `unknown` where nothing resolved. Never a model's reading: whether
// the change was right stays the judges'.
//
// **Only a no Core grounded (t771).** Rerun round 6 social
// `run-mvrj7qg8-c20c132e`: advice resting on rows a judge invented reached every
// later judge of the build, and the repair dropped the right condition. A trial
// judged unsure stood on no no Core grounded, so its advice -- a refused no's, or
// a yes's beside it -- is never told to a later judge; a trial judged no stood
// on a defect Core found in its record.

import type { AutomationStudioResultEarlierAdvice } from "../contracts/index.ts";
import { automationStudioResultStandingNoRecordOf as recordOf } from "./record-shape.ts";
import {
  automationStudioResultWrittenCondition as writtenCondition,
  automationStudioResultWrittenConditions as writtenConditions,
  type AutomationStudioResultConditionPlan
} from "./written-conditions.ts";

/** A node id's hash part, before its stable suffix. */
const HASHED = /^node\.bootstrap\.[^.]+\.(.+)$/u;

/** One judged trial with advice, as the gate kept it: `advice` is Core's sentence for the defects it located (`./earlier-advice-located.ts`). */
type Trial = { revision: number; verdict: "no" | "unsure"; advice: string; standingNo?: unknown; plan?: AutomationStudioResultConditionPlan | undefined };
/** One condition an advice named, resolved in the plan that ran. */
type Named = { name: string; changed: boolean };

/** What the judge of `revision`'s trial is told of the build's earlier judged trials (header): oldest first, every earlier revision. */
export function automationStudioResultEarlierAdvice(input: { trials: readonly Trial[]; revision: number; plan: AutomationStudioResultConditionPlan | undefined }): AutomationStudioResultEarlierAdvice[] {
  // Only a no Core grounded advises a later judge: an unsure trial's advice is a no's Core could not ground, or a yes's (header, t771).
  return input.trials.filter((trial) => trial.verdict === "no").map((trial) => {
    const named = resolved(trial, input.plan);
    const followed = !named.length ? "unknown" : named.some((one) => one.changed) ? "changed" : "unchanged";
    return {
      revision: trial.revision, verdict: trial.verdict, advice: trial.advice, followed,
      ...(named.length ? { named: named.map((one) => one.name) } : {}),
      said: said(trial, input.revision, named)
    };
  });
}

/** The conditions of Core's record that alone left out a row the trial's located defects say is asked for, each with whether `plan` changed it (header); none where nothing resolved. */
function resolved(trial: Trial, plan: AutomationStudioResultConditionPlan | undefined): Named[] {
  if (!trial.plan) return [];
  const record = recordOf(trial.standingNo);
  const asked = new Set((record?.located ?? []).filter((defect) => defect.kind === "asked_missing" || defect.kind === "wrong_value").map((defect) => fold(defect.row)));
  if (!asked.size) return [];
  const named: Named[] = [];
  const seen = new Set<string>();
  for (const condition of record?.conditions ?? []) {
    if (!condition.nodeId || !condition.number || !(condition.leftOutAlone ?? []).some((label) => asked.has(fold(label)))) continue;
    const key = `${suffix(condition.nodeId)}#${condition.number}`;
    if (seen.has(key)) continue;
    const before = writtenCondition(trial.plan, { name: condition.name, nodeId: condition.nodeId, number: condition.number });
    if (before === undefined) continue;
    seen.add(key);
    named.push({ name: `${bounded(condition.name)} of step ${suffix(condition.nodeId)}`, changed: !writtenConditions(plan).has(before) });
  }
  return named;
}

/** A step's stable suffix: its node id without the hash that changes between revisions (header). */
function suffix(nodeId: string): string {
  return HASHED.exec(nodeId)?.[1] ?? nodeId;
}

function fold(text: string): string {
  return text.toLowerCase().replace(/\s+/gu, " ").trim();
}

/** A condition's name, as Core's record gives it, bounded. */
function bounded(name: string): string {
  return name.length > 160 ? `${name.slice(0, 157)}...` : name;
}

/** Core's sentence for the judge (header). Generic words. */
function said(trial: Trial, revision: number, named: readonly Named[]): string {
  const told = `After the trial of revision ${trial.revision} (judged ${trial.verdict}) ${trial.advice} `;
  if (!named.length) return `${told}Core could not tell which conditions that names, so whether revision ${revision} changed them is not known.`;
  const changed = named.filter((one) => one.changed).map((one) => one.name);
  const left = named.filter((one) => !one.changed).map((one) => one.name);
  const parts = [
    ...(changed.length ? [`Revision ${revision} changed ${listed(changed)}, which alone left a row out there.`] : []),
    ...(left.length ? [`${changed.length ? "It" : `Revision ${revision}`} left ${listed(left)} as revision ${trial.revision} wrote ${left.length === 1 ? "it" : "them"}, though ${left.length === 1 ? "it" : "they"} alone left a row out there.`] : [])
  ];
  return `${told}${parts.join(" ")}`;
}

function listed(names: readonly string[]): string {
  return names.length === 1 ? names[0]! : `${names.slice(0, -1).join(", ")} and ${names.at(-1)!}`;
}
