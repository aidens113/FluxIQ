// What the chat model declared a task will do that lasts (t976, beside t973's intent).
//
// The user's rule (2026-11-03, 2026-11-10): a dangerous act asks one plain question only when a Flow
// or chat starts, never in the middle. To ask before anything acts, the attempt needs the classes
// the task asks for before it begins, and the chat's model already reads the person's message to
// start it. So a task's answer also declares, in "acts", Core's consequence classes the job will
// cause (`./prompt.ts`), and the attempt asks about the gated ones when it starts
// (`../../../framework/automation-service/service/answer-first/chat-permission/start.ts`). No model
// call is added for it.
//
// Read from the same object the decision is read from; nothing in the person's words is read here.
// A word Core does not know is dropped; an answer that declares no list declares nothing (`null`),
// which is not the same as an empty list: a task that changes nothing lasting.

import { automationStudioConsequencesInOrder, isAutomationStudioActionConsequence, type AutomationStudioActionConsequence } from "../../action-permission-requests/index.ts";
import { automationStudioConversationAnswerRecord } from "./answer-record.ts";

const KEYS = new Set(["acts", "consequences", "lasting"]);

/** The consequence classes an answer declares its task will cause, in Core's order, or null when it declared none. */
export function automationStudioConversationDeclaredActs(raw: unknown): AutomationStudioActionConsequence[] | null {
  const record = automationStudioConversationAnswerRecord(raw);
  if (record === null || record === "unreadable") return null;
  for (const [key, value] of Object.entries(record)) {
    if (!KEYS.has(key.toLowerCase()) || !Array.isArray(value)) continue;
    const named = value.filter((entry): entry is string => typeof entry === "string").map((entry) => entry.trim().toLowerCase());
    return automationStudioConsequencesInOrder([...new Set(named.filter(isAutomationStudioActionConsequence))]);
  }
  return null;
}
