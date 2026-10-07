// The judge's account of the loop's own test, in the step numbers the repair
// sees.
//
// **Why (live run `run-mux6naez-6c20f26e`, debug row R3-3, report
// `fix-judges-e.md` question 2).** The build's test numbers its steps as the
// round's draft did, exploratory steps and all, so the judge and Core's check
// of its rows called the list read "Step 9". The repair starts from a seed of
// the proposed steps numbered again from 1 (`./judgement.ts`,
// `automationStudioFlowBootstrapRepairSeed`), where that read is step 5, and
// `whereToFix` said so. The model was told one read under two numbers.
//
// **What changes, and what cannot.** Core's own words are put in the seed's
// numbers: the step its `checked` and `fix` lines name (`Step N:` and
// `(Step N)`, the only forms they write: `result-verification/request-rows/checked-rows.ts`,
// `verdict.ts`, `repair-directive.ts`), the read `checkedRows` names, and the
// carried steps `untestedCarried` lists. The judge's own words (expected,
// observed, advice, an unconfirmed reading) are the model's and are never
// rewritten; `testStepIsDraftStep` maps each test step number that changed to
// the draft step it now is, so they can be read in the draft's numbers
// (`../../llm/evidence-loop/resume.ts` says so). A round whose draft had no
// step out of the Flow numbers both alike, and nothing changes.

import { automationStudioFlowDraftStepIsProposed, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioFlowBootstrapJudgedWrong } from "./contracts.ts";

/** A step number in one of Core's own lines: at the line's start before a colon, or in parentheses. */
const CORE_STEP = /(^|\()Step (\d+)(?=[:)])/gu;

/** The judge's account with Core's step numbers in the repair seed's, and the map for the judge's own; as it came when no number changes. */
export function automationStudioFlowBootstrapJudgeInSeedNumbers(judge: AutomationStudioFlowBootstrapJudgedWrong, steps: readonly AutomationStudioFlowDraftStep[]): AutomationStudioFlowBootstrapJudgedWrong {
  const renumbered = new Map<number, number>();
  steps.filter(automationStudioFlowDraftStepIsProposed).forEach((step, index) => {
    if (step.position !== index + 1) renumbered.set(step.position, index + 1);
  });
  if (!renumbered.size) return judge;
  const seedStep = (position: number): number => renumbered.get(position) ?? position;
  const line = (text: string): string => text.replace(CORE_STEP, (_match, lead: string, position: string) => `${lead}Step ${seedStep(Number(position))}`);
  return {
    ...judge,
    ...(judge.fix ? { fix: judge.fix.map(line) } : {}),
    ...(judge.checked ? { checked: judge.checked.map(line) } : {}),
    ...(judge.checkedRows ? { checkedRows: judge.checkedRows.map((entry) => (entry.step === undefined ? entry : { ...entry, step: seedStep(entry.step) })) } : {}),
    ...(judge.untestedCarried ? { untestedCarried: judge.untestedCarried.map(seedStep) } : {}),
    testStepIsDraftStep: Object.fromEntries([...renumbered].map(([position, seeded]) => [String(position), seeded]))
  };
}
