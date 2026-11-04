// Which steps of an attempt came from what was saved and which were worked out again, as
// the attempt's own record says (`ChatTaskOutcome.provenance`). A step is found in the record
// by its label, or by its number on a run; one the record does not name stays unmarked, and
// an attempt with no record marks nothing. A mark heads a stretch of steps: it shows where
// the kind changes, not on every step. The first message of an attempt that used saved work
// carries the one line that says so.

import type { ClientGatewayActivity } from "fluxiq/ui";
import { usingSavedFor } from "../answer/index.ts";
import type { ChatAttemptProvenance, ChatTaskOutcome } from "../ports/index.ts";
import type { StepMessage } from "./step/index.ts";

export const FROM_SAVED_STEPS = "From saved steps";
export const WORKED_OUT_AGAIN = "Worked out again";

type TellsStep = { label?: string; index?: number };

/** The step in the record that `message` tells, if the record names it and it ran. */
function originIn(provenance: ChatAttemptProvenance | undefined, message: StepMessage, step: TellsStep | undefined): StepMessage["origin"] {
  if (provenance === undefined) return undefined;
  const label = step?.label?.trim().toLowerCase();
  const title = message.title.trim().toLowerCase();
  const found = provenance.steps.find((candidate) => {
    const named = candidate.label.trim().toLowerCase();
    return named === label || named === title;
  }) ?? provenance.steps.find((candidate) => candidate.position === step?.index);
  if (found === undefined || !found.ran) return undefined;
  return found.from === "saved" ? "saved" : "again";
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
      return { line, start: outcome.attempt.startedAtMs, end, said: false, provenance: outcome.provenance, last: undefined as StepMessage["origin"] };
    })
    .filter((span) => span !== undefined);
  if (spans.length === 0) return [...messages];
  const steps = new Map<string, TellsStep>();
  for (const event of events) {
    if (event.step !== undefined && event.step !== null) steps.set(`step:${event.activityId}#${event.sequence}`, event.step);
  }
  return messages.map((message) => {
    const span = spans.find((candidate) => message.at >= candidate.start && message.at <= candidate.end);
    if (span === undefined) return message;
    const marked: StepMessage = { ...message };
    const from = originIn(span.provenance, message, steps.get(message.key));
    if (from !== undefined && from !== span.last) marked.origin = from;
    if (from !== undefined) span.last = from;
    if (!span.said) {
      span.said = true;
      marked.usingSaved = span.line;
    }
    return marked;
  });
}
