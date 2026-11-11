// Where a FluxNode run's person-only moments go (fluxnode-plan N6): the attempt's person-ask sink
// (`AutomationStudioAnswerFirstPersonAskSink`) as a `person_needed` event, waited on in place until the
// program's `person_answer` or `waitUntil`. No answer by then is nobody answering, and the attempt
// waits for a person as it does with nobody to ask: the run ends `waiting_for_person` with a resume
// handle. The scope is the standing grant, so a permission question reaches here only for a caller
// with no scope, which a FluxNode never is.
//
// **What an answer means to the ask:** `done` takes a person-only check's Continue, grants a
// permission or confirmation, and is the note for an open question; `declined` presses Stop on the
// check, or refuses.

import type { AutomationStudioAsk, AutomationStudioAskAnswer } from "../../../../../runtime/automation-parking/index.ts";
import { AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION, AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION } from "../../../../../runtime/automation-parking/index.ts";
import type { AutomationStudioAnswerFirstPersonAskSink } from "../../flow-bootstrap-commands/index.ts";
import { automationStudioRunOverrides } from "../../../../../runtime/run-overrides/index.ts";
import type { FluxNodeRun } from "../fluxnode-run.ts";

const NO_CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/gu;
const MOST_REASON = 4000;
const ANSWERED_BY = "fluxnode.program";

export function fluxNodePersonSink(run: FluxNodeRun, waitMs: number, now: () => number): AutomationStudioAnswerFirstPersonAskSink {
  return {
    raised: () => undefined,
    answer: async (ask, wait) => {
      // A developer's `personWaitMs` governs: the expiry an ask carries is Core's default (300 s for a person-only check), which yields to it. With none given, today's rule holds and the nearer deadline wins. Either way the run still pauses for the person; no ask is skipped.
      const given = automationStudioRunOverrides()?.deadlines?.personWaitMs !== undefined;
      const until = given ? now() + waitMs : Math.min(now() + waitMs, wait.expiresAtMs ?? Number.POSITIVE_INFINITY);
      const said = await run.waitFor({ type: "person_needed", eventId: run.nextEventId(), need: needOf(ask), reason: reasonOf(ask), waitUntil: Math.floor(until) }, until);
      if (said?.type !== "person_answer") return undefined;
      return answerTo(ask, said.outcome, said.note, now());
    }
  };
}

function needOf(ask: AutomationStudioAsk): "human_check" | "confirm" | "other" {
  if (isPersonOnlyCheck(ask)) return "human_check";
  return ask.kind === "permission" || ask.kind === "confirm" ? "confirm" : "other";
}

function reasonOf(ask: AutomationStudioAsk): string {
  const text = ask.text.replace(NO_CONTROL, " ").trim();
  return [...(text || "A person is needed for this run to go on.")].slice(0, MOST_REASON).join("");
}

function answerTo(ask: AutomationStudioAsk, outcome: "done" | "declined", note: string | undefined, at: number): AutomationStudioAskAnswer {
  const base = { askId: ask.askId, answeredAt: at, actorId: ANSWERED_BY };
  if (isPersonOnlyCheck(ask)) return { ...base, kind: "choice", value: outcome === "done" ? AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION : AUTOMATION_STUDIO_PERSON_NEEDED_STOP_OPTION };
  if (outcome === "declined") return { ...base, kind: "deny", value: null };
  if (ask.kind === "open") return { ...base, kind: "text", value: note ?? "Done." };
  const first = ask.options?.[0];
  if (ask.kind === "choice" && first) return { ...base, kind: "choice", value: first.id };
  return { ...base, kind: "grant", value: null };
}

function isPersonOnlyCheck(ask: AutomationStudioAsk): boolean {
  return (ask.options ?? []).some((option) => option.id === AUTOMATION_STUDIO_PERSON_NEEDED_DONE_OPTION);
}
