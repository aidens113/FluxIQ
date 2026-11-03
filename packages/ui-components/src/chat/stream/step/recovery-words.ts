// A recovery Core reports on a run step (state-aware recovery plan, C11), in
// a person's words: the message's title and its reason, and its card's icon
// kind, short name and, when it was held back, why.
//
// Each kind of recovery reads by what it did for the run, never by Core's own
// terms ("handler", "On Before", "checkpoint", "entry") or a step's number:
//
//   handler      an extra step done around a step: something cleared out of
//                the way before it, a step done before trying again, the
//                planned way round when a step can't be done, a tidy-up after
//                it. Card "Extra step · Close the sign-up box / Done".
//   entry        a part started further along because what comes before was
//                already done. Card "Start from · Pick a time / Done".
//   route        the run carried on from the point the page was already at.
//                Card "Carry on from · Basket / Done".
//   alternative  another way to the same place, used when the usual one
//                didn't work. Card "Other way · Basket link / Done".
//   interference a notice the page put over itself, closed so the step could
//                go on. Core's own words are the line ("Closed a notice the
//                page put in the way"), so the card names no target: "Clear
//                the page / Done". Never a failure: one Core could not close
//                reads "Not done: it was still in the way".
//   reacquire    the item a step was working on moved or changed when the page
//                changed, and was looked for again from the step that found it.
//                Found: "Found it again after the page changed", card "Found
//                again · <subject> / Done". Gone: "It is no longer on the
//                page", said as not done (the retry was never tried, so never
//                "didn't work").
//   fixing       reserved for the step fixed inside the run after it truly
//                failed (in-run repair, R4b): "Fixing a step", card "Fix step".
//                Core reports it on no row yet; its words are here so that
//                card reads like the others when it comes.
//
// A retry or a planned way round is never said as a failure: only a recovery
// that itself didn't work says "didn't work". One held back before it ran
// (`refused`: a guard or the run's budget of tries) says "Not done" and why,
// never "didn't work", since nothing was tried. The words name the step the
// recovery was for when the chat already knows its label ("Did this before
// “Add the kettle”, then carried on"), and say it without one otherwise. The
// subject is Core's plain words for the recovery itself, shown on the card;
// it is never page data. No DOM.

import { activityActionVerb, type ActivityActionKind } from "fluxiq/ui";
import type { ActivityStepRecovery } from "fluxiq/ui";

/** What a recovery card stands for: one of Core's recovery kinds, or the in-run fix still to come. */
export type RecoveryCase = ActivityStepRecovery["kind"] | "fixing";

/** A recovery, as the words read it: Core's own, or the in-run fix's. */
export type RecoveryRead = { kind: RecoveryCase; subject: string; outcome: ActivityStepRecovery["outcome"]; event?: ActivityStepRecovery["event"] };

/** A recovery in words. */
export type RecoveryWords = {
  /** The message's title: what happened, in plain words. */
  title: string;
  /** Why, in plain words: the message's reasoning. */
  text: string;
  /** The kind whose icon the card shows. */
  icon: ActivityActionKind;
  /** The card's short name, beside its icon. */
  name: string;
  /** What the card names after its name: the recovery's subject, or nothing when the title already says it. */
  target: string | null;
  /** Why it was not done, for a recovery held back before it ran; undefined otherwise. */
  because: string | undefined;
};

/** The card's short name for each case. */
const NAMES: Readonly<Record<RecoveryCase, string>> = { handler: "Extra step", entry: "Start from", route: "Carry on from", alternative: "Other way", interference: "Clear the page", reacquire: "Found again", fixing: "Fix step" };

/** Words that open an extra step acting on a control, which Core's verbs do not name: closing a box is pressing its button. */
const CONTROL_WORDS = /^(close|dismiss|accept|decline|reject|hide|confirm|allow|deny|cancel|skip)$/iu;

/** Why a recovery was held back: by a guard on where the run may go, or by the run's limit on tries. */
const HELD_BACK = "it was held back before it ran";
const WOULD_SKIP = "it could have skipped something the run needs or repeated something already done";
const STILL_THERE = "it was still in the way";
const GONE = "it is no longer on the page";

/** `recovery` in words; `step` is the label of the step it was for, when the chat knows it. */
export function recoveryWords(recovery: RecoveryRead, step: string | undefined): RecoveryWords {
  const named = step?.trim() ? `“${step.trim()}”` : undefined;
  const [title, text, because] = said(recovery, named);
  return { title, text, icon: iconOf(recovery), name: NAMES[recovery.kind], target: recovery.kind === "interference" ? null : recovery.subject, because };
}

function said(recovery: RecoveryRead, step: string | undefined): [title: string, text: string, because?: string] {
  const { outcome } = recovery;
  switch (recovery.kind) {
    case "handler":
      if (outcome === "failed") return ["That extra step didn't work", step ? `Tried it for ${step}, and it didn't work.` : "Tried it, and it didn't work."];
      if (outcome === "refused") return ["Didn't do the extra step", "It was held back before it ran, so nothing was done.", HELD_BACK];
      return handlerDone(recovery.event, step);
    case "entry":
      if (outcome === "failed") return ["Couldn't start further along", "Starting from here didn't work."];
      if (outcome === "refused") return ["Didn't start further along", "Starting here could have skipped something the run needs or repeated something already done, so it wasn't used.", WOULD_SKIP];
      return ["Started further along", "What comes before this was already done, so started from here."];
    case "route":
      if (outcome === "failed") return ["Couldn't carry on from there", "Going to this point didn't work."];
      if (outcome === "refused") return ["Stayed on course", "Going to this point could have skipped something the run needs or repeated something already done, so it didn't.", WOULD_SKIP];
      return ["Carried on from where the page is", "The page was already at this point, so carried on from here."];
    case "alternative":
      if (outcome === "failed") return ["The other way didn't work either", "Tried this way instead, and it didn't work."];
      if (outcome === "refused") return ["Didn't try another way", "It was held back before it ran, so nothing was done.", HELD_BACK];
      return ["Used another way", "The usual way didn't work, so used this one instead, and it worked."];
    case "interference": {
      // Core's own words are the line; clearing the page is never a failure.
      const line = recovery.subject.trim();
      if (outcome !== "succeeded") return [line, "It was still covering the page.", STILL_THERE];
      return [line, "It was covering the page, so it was closed and the step went on."];
    }
    case "reacquire":
      if (outcome === "failed") return ["It is no longer on the page", step ? `The page changed, and the item from ${step} is gone, so there was nothing to try again.` : "The page changed, and the item is gone, so there was nothing to try again.", GONE];
      if (outcome === "refused") return ["Didn't look for it again", "It was held back before it ran, so nothing was done.", HELD_BACK];
      return ["Found it again after the page changed", step ? `The page changed, so it looked again and found the same one from ${step}, then tried it there.` : "The page changed, so it looked again and found the same one, then tried it there."];
    case "fixing":
      if (outcome === "failed") return ["Fixing a step", "It didn't work however it was tried, and fixing it here didn't work either."];
      if (outcome === "refused") return ["Fixing a step", "It didn't work however it was tried, and fixing it here was held back.", HELD_BACK];
      return ["Fixing a step", "It didn't work however it was tried, so it was fixed here and the run carried on."];
  }
}

/** An extra step that worked, by when it ran around the step it was for. */
function handlerDone(event: ActivityStepRecovery["event"], step: string | undefined): [title: string, text: string] {
  switch (event) {
    case "start":
      return ["Got things ready first", "Did this before starting."];
    case "retry":
      return ["Got ready to try again", step ? `Did this before trying ${step} again.` : "Did this before trying the step again."];
    case "fail":
      // The way round a step that can't be done is planned: never said as a failure.
      return ["Took the planned way round", `${step ? `The plan for when ${step} can't be done` : "The plan for when a step can't be done"} is to do this. Did it, then carried on.`];
    case "before_next":
      return ["Tidied up before moving on", step ? `Did this after ${step}, then carried on.` : "Did this, then carried on."];
    case "before":
    case undefined:
      return ["Cleared the way first", step ? `Did this before ${step}, then carried on.` : "Did this first, then carried on."];
  }
}

/**
 * The kind whose icon the card shows: for an extra step, the act its words
 * open with ("Wait for the page" waits, "Close the offer" presses a control),
 * else a step of its own; for a way through the Flow, choosing a path; for the
 * in-run fix, a repair.
 */
function iconOf(recovery: RecoveryRead): ActivityActionKind {
  if (recovery.kind === "fixing") return "repair";
  // Closing a notice is pressing its button.
  if (recovery.kind === "interference") return "click";
  if (recovery.kind !== "handler") return "branch";
  const first = /^\p{L}+/u.exec(recovery.subject.trim())?.[0] ?? "";
  return activityActionVerb(first)?.kind ?? (CONTROL_WORDS.test(first) ? "click" : "other");
}
