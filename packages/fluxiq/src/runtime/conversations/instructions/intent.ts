// What the chat model declared the person's message to be (t973).
//
// Every answer opens with `"intent": "task"` or `"intent": "conversation"`
// (`./prompt.ts`). The declaration is the model's own reading of the message,
// and Core holds the answer to it: a task is never answered in words
// (`./unanswered-task.ts`). Read from the same object the decision is read
// from; nothing in the person's words is read here.

import { automationStudioConversationAnswerRecord } from "./answer-record.ts";

/** What a message is: something to do or find, or conversation. */
export type AutomationStudioConversationIntent = "task" | "conversation";

const TASK = new Set(["task", "instruction", "do", "job"]);
const CONVERSATION = new Set(["conversation", "chat", "talk", "reply"]);

/** The declaration an answer carries, or null when it declared nothing Core can read. */
export function automationStudioConversationDeclaredIntent(raw: unknown): AutomationStudioConversationIntent | null {
  const record = automationStudioConversationAnswerRecord(raw);
  if (record === null || record === "unreadable") return null;
  for (const [key, value] of Object.entries(record)) {
    if (key.toLowerCase() !== "intent" || typeof value !== "string") continue;
    const said = value.trim().toLowerCase();
    if (TASK.has(said)) return "task";
    if (CONVERSATION.has(said)) return "conversation";
  }
  return null;
}
