// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";

/**
 * Whether a step did not work, read exactly as the draft entry shows it
 * `did_not_work` and the amendments refuse it (`../flow-draft/entry.ts`,
 * `../flow-draft/amendment/apply.ts`): a call that was performed, of the kind a
 * Flow is made of or one that changes something, and did not take effect. A
 * written or checked step was never performed, so it never failed.
 */
export function didNotWork(step: AutomationStudioDraftAmendmentFeedbackStep): boolean {
  return step.written !== true && step.checkedCandidate === undefined && step.effectApplied === false && (step.effect === "mutate" || step.proposes === true);
}

/**
 * What an unchanged rerun of a step that did not work is told (header, C4):
 * the call was refused and never ran, the same call would be refused again,
 * and what to change -- read off its own result, named by its call -- or that
 * new evidence comes first. Never that its result stands.
 */
export function refusedAgain(step: AutomationStudioDraftAmendmentFeedbackStep): string {
  const n = step.position;
  const codes = [coded(step.resultCode), coded(step.resultReason)].filter((code): code is string => code !== undefined);
  const said = codes.length ? ` (${codes.join(", ")})` : "";
  return `Step ${n} did not work: this exact call was refused before${said} and would be refused again, so it was not sent, and there is nothing from it to go on with. `
    + `Read what its result${under(step)} names as refused and change exactly that in a rerun: {"step": ${n}, "change": "rerun", "input": {<only the keys to change>}} -- the input merges over step ${n}'s stored argument, so a key the refusal named stays until you change it, and null removes it. `
    + "Or gather new evidence first: look at the page again, or run the action as a new call.";
}

/** Where a step's result is, by its call id, when it has one that is code-shaped. */
export function under(step: AutomationStudioDraftAmendmentFeedbackStep | undefined): string {
  const call = coded(step?.callId);
  return call === undefined ? "" : ` under call ${call}`;
}

// A word Core may quote from a step: letters, digits and code punctuation, with
// no space, so neither a page's text nor a value it carried can pass.
export const CODE_SHAPED = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/u;

/** The value when it is code-shaped, and nothing otherwise. */
export function coded(value: string | undefined): string | undefined {
  return value !== undefined && CODE_SHAPED.test(value) ? value : undefined;
}
