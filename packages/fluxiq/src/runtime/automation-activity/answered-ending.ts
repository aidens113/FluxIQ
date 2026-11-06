import { ACTIVITY_ATTEMPT_WORDS } from "../../ui/index.ts";
import { emitAutomationStudioActivity } from "../activity/index.ts";

/** What the activity says at the end of an answer-first attempt. */
export type AutomationStudioAnsweredEnding = { phase: "done" | "failed"; label: string };

/**
 * What the activity says at the end of an answer-first attempt, in a person's words: the
 * attempt's own status, which holds no failure but a budget gone. The answer itself is the
 * answer turn's (`../conversations/`). Absent for any other build.
 */
export function answeredEnding(built: unknown): AutomationStudioAnsweredEnding | undefined {
  const ended = built && typeof built === "object" ? (built as { status?: unknown }).status : undefined;
  if (ended === "setup_needed") return { phase: "done", label: ACTIVITY_ATTEMPT_WORDS.setup };
  if (ended !== "answered") return undefined;
  const status = (built as { attempt?: { status?: unknown } }).attempt?.status;
  // A budget gone is an ending the task reached, not an error, so it is not drawn as one.
  if (status === "budget_out") return { phase: "done", label: ACTIVITY_ATTEMPT_WORDS.budget };
  if (status === "stopped_by_person") return { phase: "done", label: ACTIVITY_ATTEMPT_WORDS.stopped };
  if (status === "waiting_for_person") return { phase: "done", label: ACTIVITY_ATTEMPT_WORDS.waiting };
  return { phase: "done", label: ACTIVITY_ATTEMPT_WORDS.finished };
}

/** The attempt's closing row, the one that settles the toast and the header. */
export function emitAnsweredEnding(ending: AutomationStudioAnsweredEnding): void {
  emitAutomationStudioActivity({ phase: ending.phase, label: ending.label, detail: { kind: "step", title: ending.label, status: ending.phase === "failed" ? "failed" : "succeeded" }, final: true });
}
