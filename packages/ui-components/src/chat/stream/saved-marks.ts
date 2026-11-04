// Which steps of an attempt that used saved work can be told apart, from what the records
// prove. A run plays saved steps with no model, so a run's step is "From saved steps"; a
// thought (a decision or a repair) is the model working something out, and so is an action
// of a build, so those are "Worked out again". Anything else, and any step outside such an
// attempt's span, is left unmarked. A mark heads a stretch of steps: it shows where the
// kind changes, not on every step. The first message of the span carries the one line that
// says the attempt is using what was saved.

import type { ClientGatewayActivity } from "fluxiq/ui";
import { usingSavedFor } from "../answer/index.ts";
import type { ChatTaskOutcome } from "../ports/index.ts";
import type { StepMessage } from "./step/index.ts";

export const FROM_SAVED_STEPS = "From saved steps";
export const WORKED_OUT_AGAIN = "Worked out again";

function origin(message: StepMessage, subject: "build" | "run" | undefined): StepMessage["origin"] {
  if (message.kind === "decision" || message.kind === "repair") return "again";
  if (message.kind === "step" && subject === "run") return "saved";
  if (message.kind === "action" && subject === "build") return "again";
  return undefined;
}

/** `messages` with the marks of every outcome that used saved work; the rest unchanged. */
export function markSavedSteps(
  messages: readonly StepMessage[],
  events: readonly ClientGatewayActivity[],
  outcomes: readonly ChatTaskOutcome[],
  nowMs: number
): StepMessage[] {
  const spans = outcomes
    .map((outcome, index) => {
      const line = usingSavedFor(outcome, nowMs);
      if (line === undefined) return undefined;
      const end = outcome.attempt.endedAtMs ?? outcomes[index + 1]?.attempt.startedAtMs ?? Number.POSITIVE_INFINITY;
      return { line, start: outcome.attempt.startedAtMs, end, said: false, last: undefined as StepMessage["origin"] };
    })
    .filter((span) => span !== undefined);
  if (spans.length === 0) return [...messages];
  const subjects = new Map<string, "build" | "run">();
  for (const event of events) subjects.set(event.activityId, event.subject.kind);
  return messages.map((message) => {
    const span = spans.find((candidate) => message.at >= candidate.start && message.at <= candidate.end);
    if (span === undefined) return message;
    const marked: StepMessage = { ...message };
    const from = origin(message, subjects.get(message.activityId));
    if (from !== undefined && from !== span.last) marked.origin = from;
    if (from !== undefined) span.last = from;
    if (!span.said) {
      span.said = true;
      marked.usingSaved = span.line;
    }
    return marked;
  });
}
