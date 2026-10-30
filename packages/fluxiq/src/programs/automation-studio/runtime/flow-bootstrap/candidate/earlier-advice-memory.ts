// What a trial gate keeps of its build's judged trials' advice, for the judge
// of each later trial (t752): the whole-candidate gate per build
// (`./trial-gate.ts`), the subflow gate per brief, seeded from the earlier
// briefs of its subflow (`../subflow-candidate/subflow-trial-gate.ts`).
//
// **Why.** A build test's judges saw only the trial in front of them. In a
// breadth rerun, a whole test was judged no and its judge advised one change
// to a read's condition; the next revision made exactly that change and stored
// exactly the rows asked for, and its judges answered no for that very change.
// The judge request carried nothing of the earlier trial. So each judged trial
// with a defect Core located in its record (P5b: never a judge's prose advice) is
// kept here as Core's sentence for it, with Core's record of the trial and the plan that ran, the
// every earlier revision; before the gate asks for a trial of another revision, Core says
// what each advised and whether that revision changed what it named
// (`../../result-verification/standing-no/earlier-advice.ts`), and the request
// carries it to the summary the judge reads. Core-only: kept outside what a
// model is shown, and read back from a port only by its shape.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioResultEarlierAdvice } from "../../result-verification/contracts/index.ts";
import { automationStudioResultEarlierAdvice, automationStudioResultLocatedAdvice, automationStudioResultStandingNoRecordOf, type AutomationStudioResultConditionPlan } from "../../result-verification/standing-no/index.ts";

/** One judged trial with advice, as a gate keeps it (header). */
export type AutomationStudioCandidateEarlierAdviceTrial = {
  revision: number;
  verdict: "no" | "unsure";
  /** Core's sentence for the defects it located in its record of the trial (P5b), never a judge's advice. */
  advice: string;
  /** Core's record of the trial (`../../result-verification/standing-no/`), unread. */
  standingNo?: unknown;
  /** The plan of the revision that ran. */
  plan?: AutomationStudioResultConditionPlan;
};

/** One gate's memory of its build's judged trials' advice (header). */
export class AutomationStudioCandidateEarlierAdviceMemory {
  private readonly kept: AutomationStudioCandidateEarlierAdviceTrial[] = [];

  /** Seeded with earlier briefs' kept trials, oldest first; a value not of the shape is skipped. */
  constructor(earlier: readonly unknown[] = []) {
    for (const value of earlier) {
      const trial = trialOf(value);
      if (trial) this.keep(trial);
    }
  }

  /**
   * Keeps what Core located in a judged trial's record (P5b, header), and answers what it kept; nothing where it
   * located no defect. The feedback the builder was shown is not read: a judge's prose advice is never kept.
   */
  remember(trial: { revision: number; verdict: string; feedback?: JsonObject; standingNo?: unknown; plan?: AutomationStudioResultConditionPlan | undefined }): AutomationStudioCandidateEarlierAdviceTrial | undefined {
    if (trial.verdict !== "no" && trial.verdict !== "unsure") return undefined;
    const advice = automationStudioResultLocatedAdvice(automationStudioResultStandingNoRecordOf(trial.standingNo)?.located);
    if (!advice) return undefined;
    const kept: AutomationStudioCandidateEarlierAdviceTrial = {
      revision: trial.revision, verdict: trial.verdict, advice,
      ...(trial.standingNo !== undefined ? { standingNo: structuredClone(trial.standingNo) } : {}),
      ...(trial.plan ? { plan: structuredClone(trial.plan) } : {})
    };
    this.keep(kept);
    return structuredClone(kept);
  }

  /** What the judge of `revision`'s trial is told of the completed judged trials, oldest first. */
  advice(revision: number, plan: AutomationStudioResultConditionPlan | undefined): AutomationStudioResultEarlierAdvice[] {
    return automationStudioResultEarlierAdvice({ trials: this.kept, revision, plan });
  }

  /** Completed judged trials in order; a retest or a rebrief can reuse a revision number. */
  private keep(trial: AutomationStudioCandidateEarlierAdviceTrial): void {
    this.kept.push(trial);
  }
}

/** A kept trial read back from a port (header): a copy where it has the shape, nothing otherwise. */
function trialOf(value: unknown): AutomationStudioCandidateEarlierAdviceTrial | undefined {
  if (!isRecord(value) || !Number.isSafeInteger(value.revision) || (value.verdict !== "no" && value.verdict !== "unsure")) return undefined;
  // Rebuilt from Core's located defects whatever advice the value carries: an earlier brief's prose advice is not carried on (P5b).
  const advice = automationStudioResultLocatedAdvice(automationStudioResultStandingNoRecordOf(value.standingNo)?.located);
  if (!advice) return undefined;
  const plan = isRecord(value.plan) && Array.isArray(value.plan.subflows) ? structuredClone(value.plan) as AutomationStudioResultConditionPlan : undefined;
  return {
    revision: value.revision as number, verdict: value.verdict, advice,
    ...(value.standingNo !== undefined ? { standingNo: structuredClone(value.standingNo) } : {}),
    ...(plan ? { plan } : {})
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
