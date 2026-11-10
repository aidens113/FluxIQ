// Whether a person's exact words are a task that already has a saved Flow, for the chat to start it
// with no model call (task speed S6, `../../instructions/known-task.ts`). It asks the same read route
// "automate this" asks to reuse the task's Flow (`./known-flow.ts`), on the page the request has on
// screen, so the chat skips its model only when the command it starts will find that Flow. Outside
// answer-first mode no task has a Flow, and nothing is known.

import type { AutomationStudioConversationKnownTask } from "../../instructions/index.ts";
import type { AutomationStudioConversationCommandContext } from "../command.ts";
import { automationStudioConversationKnownFlow } from "./known-flow.ts";

export function automationStudioConversationKnownTask(context: Pick<AutomationStudioConversationCommandContext, "port" | "projectId" | "startLocation">): AutomationStudioConversationKnownTask {
  return async (instructionText) => (await automationStudioConversationKnownFlow(context, instructionText)) !== undefined;
}
