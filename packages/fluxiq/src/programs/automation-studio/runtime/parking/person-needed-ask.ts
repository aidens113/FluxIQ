// The one question Core asks when the work meets something only a person can
// get past -- a robot check, in the web domain's words.
//
// **Why FluxIQ asks rather than acts.** A check that asks "are you a robot" is
// asking the person, and FluxIQ answering it would be FluxIQ pretending to be
// them. So FluxIQ never presses, types into or reloads a check. A domain that
// meets one reports its call as needing a person (`personNeeded` on a build
// tool result, failure class `user_intervention_required` on a run's node), and
// Core puts this question in the Flow's thread: the build or the run waits
// where it stands, the person completes the check in the browser and presses
// Continue, and the work resumes with a fresh look at the page. Nobody
// answering, or the person pressing Stop, ends the work with a person-needed
// code instead of a loop that keeps knocking on the check.
//
// **Why a choice and not a confirm.** The person reads two plain buttons,
// "Continue" and "Stop", instead of "Yes" and "No" under a sentence that is not
// a yes-or-no question. The answer is the option id.
//
// **The marker.** `control.kind` is what lets a surface -- or the Lab, which
// plays the person -- tell this question from every other ask without reading
// its words, which are free to change.

import type { AutomationStudioAskAnswer } from "./answer.ts";
import type { AutomationStudioAsk, AutomationStudioAskDraft } from "./ask.ts";
import type { AutomationStudioPermissionAsk } from "./permission-ask.ts";

/** `control.kind` on every person-needed ask, and on nothing else. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND = "person_check";
/** The option a person presses once they have completed the check. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION = "person_done";
/** The option a person presses to stop the work instead. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION = "person_stop";
/** What the person is asked, in the thread and on the page's overlay. */
export const AUTOMATION_STUDIO_PERSON_NEEDED_TEXT = "FluxIQ needs you: complete the check on this page, then press Continue.";

/**
 * How long the work waits for a person, at most.
 *
 * Longer than a permission question's two minutes: a permission is read and
 * answered, a check has to be found in the browser and completed first.
 */
export const AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS = 300_000;

/**
 * The ask, as a raiser writes it. The run's routes are the ask's defaults:
 * Continue resumes down `success`, Stop and nobody answering go down `failed`.
 */
export function automationStudioPersonNeededAskDraft(input: {
  askId?: string | undefined;
  timeoutMs?: number | undefined;
  /** What the check is, as the person would recognise it, when the domain said. */
  controlName?: string | null | undefined;
}): AutomationStudioAskDraft {
  const timeoutMs = typeof input.timeoutMs === "number" && Number.isFinite(input.timeoutMs) && input.timeoutMs > 0
    ? Math.min(Math.round(input.timeoutMs), AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS)
    : AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS;
  return {
    ...(input.askId ? { askId: input.askId } : {}),
    kind: "choice",
    parks: true,
    timeoutMs,
    onTimeout: "deny",
    options: [
      { id: AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, label: "Continue", route: null },
      { id: AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION, label: "Stop", route: "failed" }
    ],
    routes: { granted: "success", denied: "failed", timedOut: "failed" },
    consequences: [],
    control: { name: input.controlName ?? "robot check", kind: AUTOMATION_STUDIO_PERSON_NEEDED_CONTROL_KIND },
    text: AUTOMATION_STUDIO_PERSON_NEEDED_TEXT
  };
}

/** True only when the person said they completed the check. */
export function automationStudioPersonNeededAnswerIsDone(answer: AutomationStudioAskAnswer | undefined | null): boolean {
  return answer?.kind === "choice" && answer.value === AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION;
}

/**
 * How one person-needed question came out, for a caller that waited on it.
 *
 * `done` is the only outcome the work goes on from. The others each end it
 * with a person-needed code, and are told apart only so the ending can say
 * which: the person pressed Stop (`stopped`), nobody answered in time
 * (`timed_out`), the question could not be put or waited on at all
 * (`unreachable`), or the caller's own work was cancelled while it waited
 * (`cancelled`).
 */
export type AutomationStudioPersonNeededOutcome = "done" | "stopped" | "timed_out" | "unreachable" | "cancelled";

/**
 * The ask a raiser drafted, completed with what only the raiser's host knows:
 * the pending status and where it was raised. Options and routes are written
 * out in full, because the thread stores what it is given.
 */
export function automationStudioPersonNeededAsk(draft: AutomationStudioAskDraft & { askId: string }, raisedBy: AutomationStudioAsk["raisedBy"]): AutomationStudioAsk {
  return {
    ...draft,
    options: draft.options ? draft.options.map((option) => ({ id: option.id, label: option.label ?? option.id, route: option.route ?? null })) : null,
    status: "pending",
    raisedBy
  };
}

/**
 * Puts the person-needed question in a thread and waits for the answer.
 *
 * Beside `automationStudioAskedAndGranted`, and deliberately unlike it in one
 * way: a permission question nobody answers leaves the caller with the refusal
 * it already had, and its work goes on without the act. Work that met a check
 * cannot go on without the person, so every outcome but `done` is the caller's
 * reason to stop -- and a port that cannot wait is `unreachable` rather than a
 * question opened and walked away from.
 *
 * The wait is the ask's own `timeoutMs`, which `automationStudioPersonNeededAskDraft`
 * has already capped, so no caller holds work open longer than Core allows.
 */
export async function automationStudioAskedPersonNeeded(
  ask: Pick<AutomationStudioPermissionAsk, "port" | "signal" | "now">,
  raised: AutomationStudioAsk
): Promise<AutomationStudioPersonNeededOutcome> {
  const now = ask.now ?? Date.now;
  const waitMs = typeof raised.timeoutMs === "number" && raised.timeoutMs > 0
    ? Math.min(raised.timeoutMs, AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS)
    : AUTOMATION_STUDIO_PERSON_NEEDED_ASK_TIMEOUT_MS;
  try {
    if (!ask.port.awaitAnswer) return "unreachable";
    await ask.port.open(raised);
    const answer = await ask.port.awaitAnswer(raised, { expiresAtMs: now() + waitMs, ...(ask.signal ? { signal: ask.signal } : {}) });
    if (ask.signal?.aborted) return "cancelled";
    if (!answer) return "timed_out";
    return automationStudioPersonNeededAnswerIsDone(answer) ? "done" : "stopped";
  } catch {
    // A thread that could not be written to or read is a question nobody was
    // asked, and the work cannot pretend it was answered.
    return ask.signal?.aborted ? "cancelled" : "unreachable";
  }
}
