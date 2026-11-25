// Split from the former `../draft-amendment-feedback.ts` (t694); the module's account is in `./index.ts`.

import type { AutomationStudioFlowDraftAmendmentRefusal } from "../../flow-authoring/draft/index.ts";
import type { AutomationStudioDraftAmendmentFeedbackStep } from "./step.ts";
import { didNotWork, under } from "./did-not-work.ts";
import { existingPositions } from "./positions.ts";

/**
 * Each reason's own way out, by the number the model wrote, for a refusal no
 * more precise answer above covers: the edit or call to send instead,
 * placeholders in angle brackets where only the model knows the value
 * (header, W2). Exhaustive by type, so a reason added to the draft's set fails
 * to compile until it is given one here. A step joins the Flow by running it,
 * so a step not in the draft yet is run, never named.
 */
export function fallback(refusal: AutomationStudioFlowDraftAmendmentRefusal, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[], actsNotDone: readonly string[] | undefined): string {
  const n = refusal.step;
  const step = steps.find((candidate) => candidate.position === n);
  const key = refusal.parameter ?? "each value";
  const rerun = `{"step": ${n}, "change": "rerun", "input": {<only the keys that change>}}`;
  const ways: Record<AutomationStudioFlowDraftAmendmentRefusal["reason"], () => string> = {
    no_such_step: () => existingPositions(steps).includes(n)
      ? `Step ${n} is in the draft, but the step its over, while or through named is not: name only a step listed under positions, as the draft shows it; a step not run yet is run first, and running it puts it in the draft.`
      : `There is no step ${n} in the draft: name a step listed under positions, as the draft shows it, or run the call you meant; running it puts it in the draft.`,
    already_so: () => `Step ${n} already says that, so it stays as it is: do not send the same change again. Send step ${n} a different change only if it should say something else; otherwise go on with what the Flow still lacks.`,
    no_such_position: () => `Step ${n}'s repeat was not made: its through has to name a step of the draft at or after step ${n}. Send {"step": ${n}, "change": "repeat", "over": <the listing>, "through": <the span's last step>}, or leave step ${n} as it is.`,
    run_by_the_loop: () => `Step ${n} was not rerun. Send it on its own in the next decision, with an input: ${rerun} -- one rerun per decision -- or, when its action is no longer offered, run an offered tool as a new call.`,
    no_step_before_it: () => `Step ${n} has no step before it in the Flow for this repeat to be over: name the listing it is over -- {"step": ${n}, "change": "repeat", "over": <the listing>} -- or leave step ${n} as it is.`,
    over_not_before: () => `Step ${n}'s repeat over step ${refusal.over ?? "<the listing>"} was refused: the repeat goes on the act done to each row, over the listing before it. Send {"step": <the act>, "change": "repeat", "over": <the listing>}; when the listing ran after the act, do the act again on one row the listing kept, after it, and put the repeat on that step.`,
    not_a_kept_step: () => notKept(n, step),
    did_not_work: () => `Step ${n} did not work, so it is already out of the Flow: leave it, and do not drop or keep it. To have what it tried, read what its result${under(step)} names as refused and rerun it with exactly that changed: ${rerun} -- or run the action again as a new call.`,
    already_in_flow: () => `Step ${n} is in the Flow already: leave it, and do not keep it again. Run what the Flow still lacks, or complete.`,
    already_out: () => `Step ${n} is out of the Flow already: leave it out, or send {"step": ${n}, "change": "keep"} if the Flow needs it after all.`,
    changes_nothing: () => `Step ${n}'s identical call was not sent again: on the same page it would do what it did before. Rerun it only with what should differ -- ${rerun} -- or leave step ${n} as it is and go on with what the Flow still lacks.`,
    act_on_a_read: () => actOnRead(n, steps),
    act_already_named: () => refusal.act !== undefined && actsNotDone?.includes(refusal.act)
      ? `Step ${n} already names ${refusal.act}, and the checklist still shows it not done: naming it again changes nothing. Its todo says why and which step: correct exactly that step -- rerun it with a corrected argument -- or run the act's own control as a new call with act ${refusal.act}.`
      : `Step ${n} already names ${refusal.act ?? "that act"}, so naming it again changes nothing: leave step ${n} as it is and go on with what the Flow still lacks, or complete.`,
    bind_not_a_binding: () => `On step ${n}, ${key} is not a binding form. To bind it, send bind on step ${n} with ${key} set to {"$input": <name>, "test": <its value>} (or {"$row": <field>} inside a repeat); to give it another concrete value, rerun step ${n} with it: ${rerun}.`,
    bind_new_key: () => refusal.bindable?.length
      ? `Step ${n} ran with no value at ${key}: bind one of ${refusal.bindable.join(", ")} on step ${n} instead, or leave it as it is.`
      : `Step ${n} has no value to bind at ${key}: leave step ${n} as it is. A value that should vary is bound on the step that typed it, or written into a new step with a new call with write true.`,
    bind_row_outside_loop: () => `Step ${n} is in no repeat, so ${key} has no row to come from: send {"step": ${n}, "change": "repeat", "over": <the listing>} first and the bind after it, or bind ${key} as {"$input": <name>, "test": <its value>} when it is the same for every row.`,
    bind_malformed: () => `Write ${key} on step ${n} again in one of the forms reasons.bind_malformed lists and send it again; to set a concrete value instead, rerun step ${n} with it: ${rerun}.`,
    rerun_holds_binding: () => `Step ${n} holds a binding, so it runs only in the Flow: rerun it with a concrete value for every bound parameter -- {"step": ${n}, "change": "rerun", "input": {<each bound key: a value>}} -- or write the step you need as a new call to core.run_node with write true.`,
    strands_a_step: () => `Step ${n} stays in the Flow: it brings the page to where a later step of the Flow acted. Leave step ${n} in, or drop that later step too if the Flow does not need it.`,
    second_copy: () => `Step ${n} was not put back in the Flow: a step of the Flow already does it, and the Flow does each step once. Leave it out and go on with what the Flow still lacks.`,
    act_not_done_there: () => {
      const act = refusal.act ?? "<the act>";
      const there = refusal.instead !== undefined
        ? `name it on step ${refusal.instead}, whose words name it: {"step": ${refusal.instead}, "change": "keep", "act": "${act}"}`
        : `run the press whose words name it as a new call with act ${act}`;
      return `Step ${n} did something else and does not do ${act}, so ${act} was not recorded on step ${n}: ${there}; do not name ${act} on step ${n} again.`;
    },
    settings_rewrite_run: () => `Step ${n} keeps what it ran with. To act on another control or with another value, run that call as a new step with its act; to correct step ${n}'s own argument, rerun it: ${rerun}.`,
    holds_a_repeat: () => `Step ${n} stays in the Flow: repeat on step ${refusal.repeat ?? "<the head>"} names it as ${refusal.whileLoop ? "while" : refusal.holds ?? "over or through"}. Leave it in, or send {"step": ${refusal.repeat ?? "<the head>"}, "change": "unrepeat"} or revise that repeat's reference before withdrawing step ${n}.`,
    span_holds_routing: () => `The change to step ${n} was not made: step ${refusal.repeat ?? "<the head>"}'s repeat through step ${refusal.through ?? "<the last step>"} would hold routed step ${refusal.routed ?? "<the inner step>"}. Say routing once, on the span's head. Take off the inner routing (${refusal.routed ?? "<the inner step>"} unrepeat for a repeat, keep for a condition), or end the outer span before it, then send the intended change again.`,
    not_a_read: () => `Step ${n} does not read, so it cannot be the result: send {"step": <the read that holds the answer>, "change": "result"}, or leave step ${n} as it is.`,
    // Assembly's own sentence when there is one: it names the library's nodes that end a loop (`../harness-options/draft-acts.ts`).
    repeat_never_ends: () => refusal.said?.trim()
      || `Step ${n}'s repeat was not made: its span's last step cannot answer that there is nothing more, so the loop could end only by failing. Run the step that answers ended when there is nothing more as a new call, as the span's last step, and send {"step": ${n}, "change": "repeat", "while": <that step>}; or leave step ${n} to run once.`
  };
  return ways[refusal.reason]();
}

/**
 * A repeat, bind or act named a step that is not in the Flow: the look named
 * itself, the step named is out of the Flow, or -- the step named being in it
 * -- the step its over, while or through named is not.
 */
export function notKept(n: number, step: AutomationStudioDraftAmendmentFeedbackStep | undefined): string {
  if (step?.effect !== undefined && !(step.proposes ?? step.effect === "mutate")) {
    return `Step ${n} only looked, so it is never in the Flow and does no act: leave it, and run the step that does what you meant as a new call (with its act).`;
  }
  if (step && didNotWork(step)) return `Step ${n} did not work, so it is not in the Flow: rerun it with a corrected argument, {"step": ${n}, "change": "rerun", "input": {<only the keys that change>}}, then send this change again.`;
  if (step?.disposition !== undefined && step.disposition !== "kept") {
    return `Step ${n} is not in the Flow (inResult false): put it back first, {"step": ${n}, "change": "keep"}, and send this change again in the next decision -- or leave step ${n} out.`;
  }
  if (step?.disposition === "kept") {
    return `Step ${n} is in the Flow, but the step its over, while or through named is not: name a step whose inResult is true, or put that step back first with {"step": <that step>, "change": "keep"} and send this change again in the next decision.`;
  }
  return `Name only steps whose inResult is true: step ${n} and the step its over, while or through named each have to be in the Flow -- put back one that is not with {"step": <it>, "change": "keep"} first, or leave step ${n} as it is.`;
}

/** An act named on a read: the press after it to name the act on, or that one is still to run. */
export function actOnRead(n: number, steps: readonly AutomationStudioDraftAmendmentFeedbackStep[]): string {
  const lead = `Step ${n} only reads, so the act was not recorded on it; the rest of that change was made.`;
  const press = steps.find((step) => step.position > n && step.effect === "mutate" && step.effectApplied !== false);
  if (press) return `${lead} Name the act on the step that does it: {"step": ${press.position}, "change": "keep", "act": <the act>}, if step ${press.position} is that act's press.`;
  const known = steps.some((step) => step.effect !== undefined);
  return known
    ? `${lead} No step after step ${n} does an act yet: run the press that does it as a new call with its act.`
    : `${lead} Name the act on the press that does it, {"step": <that press>, "change": "keep", "act": <the act>}, or run that press as a new call with its act.`;
}
