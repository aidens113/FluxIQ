// What the builder is told of a trial that runs steps with no witness (t791
// fix 4, `./project-reset.ts`, `admit`): the trial runs and is judged by its
// end view and each step's done-when check, Core reads no change of those
// steps, and the parts they serve stay unproven by what Core read. Each step is
// told what it can do about that in its own tab (t791 fix 2, `../reset-admission/step-gaps.ts`):
// the refs read in that tab and nowhere else, or that no call there can make a
// witness. Generic: they name no site.

import type { AutomationStudioTrialUnwitnessedStep } from "../trial-change/index.ts";
import type { AutomationStudioSiteResetStepReachAnswer } from "../reset-admission/index.ts";
import { AUTOMATION_STUDIO_SITE_RESET_WORDS as WORDS } from "./words.ts";

/** The most steps named, and the most of a label quoted. */
const NAMED_CAP = 5;
const LABEL_CAP = 80;

/** One step with no witness, and where it stands in its own tab. */
export type AutomationStudioSiteResetUnwitnessedReach = AutomationStudioTrialUnwitnessedStep & AutomationStudioSiteResetStepReachAnswer;

export const AUTOMATION_STUDIO_SITE_RESET_UNWITNESSED_STEP_WORDS = Object.freeze({
  /** Said with a trial that runs `steps`, each a reversible lasting step whose stamp is missing or no longer resolves (header). */
  ran(steps: readonly AutomationStudioSiteResetUnwitnessedReach[]): string {
    // Labelled first: the plan's numbering counts no start or subflow call, so a trial's feedback numbers its steps otherwise.
    const name = ({ step, label }: AutomationStudioTrialUnwitnessedStep): string => (label ? `${JSON.stringify(label.length > LABEL_CAP ? `${label.slice(0, LABEL_CAP - 1)}…` : label)} (plan step ${step})` : `plan step ${step}`);
    const named = steps.slice(0, NAMED_CAP).map(name);
    const more = steps.length > NAMED_CAP ? ` and ${steps.length - NAMED_CAP} more` : "";
    const one = steps.length === 1;
    // What each step can do about it, once where steps share the words, else by step.
    const how = steps.map((entry) => ({ entry, words: entry.canMeet === "no_call" ? WORDS.stepWitnessUnreachable() : WORDS.stepWitnessRequired(entry.issued) }));
    const distinct = [...new Set(how.map(({ words }) => words))];
    const advice = distinct.length === 1 ? distinct[0]! : how.slice(0, NAMED_CAP).map(({ entry, words }) => `For ${name(entry)}: ${words}`).join(" ");
    return `This trial ran with the step${one ? "" : "s"} ${named.join(", ")}${more} changing something on the site where no place was named that shows ${one ? "its" : "their"} change, so Core could not read what ${one ? "it" : "they"} changed. `
      + `The trial is judged by its end view and each step's done-when check, and the task parts ${one ? "it serves" : "they serve"} stay unproven by what Core read: give each such step a done-when check that shows its change on the page. `
      + advice;
  }
});
