// What a task's start is handed from its chat (t976): the person's answer so far, and the classes
// the task needs -- those the chat's reading declared for this message, with any the chat kept for
// the same words from an earlier start (an unforeseen class among them). No model call is made. A
// chat record that cannot be read is none, and the person is asked again, the safe side.

import type { AutomationStudioFlowBootstrapStartRequest } from "../../../../../runtime/flow-authoring/bootstrap/index.ts";
import type { AutomationStudioAnswerFirstChatPermission } from "./chat.ts";
import type { AutomationStudioAnswerFirstChatPermissionStore } from "./store.ts";

export async function automationStudioAnswerFirstChatStartRequest(input: {
  chat: Pick<AutomationStudioAnswerFirstChatPermissionStore, "get">;
  projectId: string;
  flowId: string;
  /** The instruction's key (`./instruction-key.ts`). */
  instruction: string;
  taskActs?: readonly string[] | undefined;
}): Promise<Omit<AutomationStudioFlowBootstrapStartRequest, "ask">> {
  let held: AutomationStudioAnswerFirstChatPermission | undefined;
  try {
    held = await input.chat.get(input.projectId, input.flowId);
  } catch {
    /* best-effort: a chat record that cannot be read means the person is asked again, the safe side. */
    held = undefined;
  }
  const kept = held?.needs.find((entry) => entry.instruction === input.instruction)?.classes;
  const classes = input.taskActs || kept || held?.unforeseen.length ? [...new Set([...(input.taskActs ?? []), ...(kept ?? []), ...(held?.unforeseen ?? [])])] : undefined;
  return {
    ...(held ? { held: { granted: held.granted, declined: held.declined, requestId: held.declinedRequestId } } : {}),
    ...(classes ? { classes } : {})
  };
}
