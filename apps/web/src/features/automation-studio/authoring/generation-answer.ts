/**
 * What an answer-first attempt comes back as from `generate-flow-bootstrap-adaptation`: an
 * `answered` attempt (achieved, budget out, stopped, waiting for the person, still going) or a
 * `setupNeeded` step. Neither is a proposal and neither is a failure; the panel says each in one
 * plain line. The words are Core's own for the chat
 * (`runtime/conversations/commands/answer-first/outcome.ts`); the panel is parked for redesign, so
 * they are repeated here rather than exported from Core for it.
 */
const SAID: Readonly<Record<string, string>> = Object.freeze({
  achieved: "I got what you asked for, and it was checked once against what you asked.",
  budget_out: "The budget for this ran out before I could confirm it. What I found so far is kept.",
  stopped_by_person: "Stopped, as you asked. What I found so far is kept.",
  waiting_for_person: "This needs you before it can go on. What I found so far is kept.",
  working: "This is still going. What I found so far is kept."
});

/** The line to show for an attempt's answer, or undefined when `generated` is any other kind of answer. */
export function generationAnswerLine(generated: { ok?: boolean; payload?: unknown } | undefined): string | undefined {
  if (!generated?.ok || !generated.payload || typeof generated.payload !== "object") return undefined;
  const payload = generated.payload as { answered?: { attempt?: { status?: unknown } }; setupNeeded?: { say?: unknown } };
  if (payload.answered) {
    const status = payload.answered.attempt?.status;
    return typeof status === "string" && SAID[status] ? SAID[status] : SAID.working;
  }
  if (payload.setupNeeded) return typeof payload.setupNeeded.say === "string" && payload.setupNeeded.say ? payload.setupNeeded.say : "Something needs setting up before I can start.";
  return undefined;
}
