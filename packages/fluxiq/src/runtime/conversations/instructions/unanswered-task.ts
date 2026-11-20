// A reply in words is only for conversation (t973).
//
// The chat model declares what a message is before it answers (`./intent.ts`).
// A reply is valid only when it declared conversation: a reply to a message it
// declared a task, or a reply that declared nothing, left the person's job
// unstarted -- the "would you like me to start it?" that stalled two live tasks
// with no thinking (run-mwoqy6fo-f44d3e98, run-mwos5phg-115e3a15). Such an
// answer is asked for again, one rung up the model ladder, with the reason
// (`./interpret.ts`). A capability chosen, or one question back, is never
// judged here: the person's words are not read, only the model's declaration
// and the shape of what it answered.

import type { AutomationStudioConversationDecision } from "./decision.ts";
import type { AutomationStudioConversationIntent } from "./intent.ts";

/** Why an answer cannot stand, for the model's correction and the climbed call's step meta. */
export type AutomationStudioConversationUnansweredTask = {
  /** Closed words for the step meta: `task_answered_in_words` or `reply_undeclared`. */
  reason: "task_answered_in_words" | "reply_undeclared";
  /** What the model is told when it is asked again. */
  correction: string;
};

const TASK_ANSWERED_IN_WORDS = 'You said their message is a task and answered it with a reply. A task is never answered in words: start it with the capability that does it, as {"intent": "task", "do": "<capability id>", "with": {...}}, and give it a full effort. Do not ask whether to start: any permission it needs is asked by FluxIQ itself. Ask a question instead only when it is truly impossible to tell what they want.';
const REPLY_UNDECLARED = 'Your answer did not say what their message is. Answer again with one JSON object that opens with "intent": "task" when it asks for something to be done or found -- then start it with {"do": ...} -- or "conversation" when it asks for nothing, and only then {"reply": ...}.';

/** Why this answer leaves a task unstarted, or null when it stands. */
export function automationStudioConversationUnansweredTask(decision: AutomationStudioConversationDecision, intent: AutomationStudioConversationIntent | null): AutomationStudioConversationUnansweredTask | null {
  if (decision.kind !== "reply" || intent === "conversation") return null;
  return intent === "task"
    ? { reason: "task_answered_in_words", correction: TASK_ANSWERED_IN_WORDS }
    : { reason: "reply_undeclared", correction: REPLY_UNDECLARED };
}
