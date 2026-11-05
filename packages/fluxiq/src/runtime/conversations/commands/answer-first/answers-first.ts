import { resolveAutomationStudioBuildAuthoringMode } from "../../../../flows/authoring/model/authoring-mode/index.ts";

/** In answer-first mode a command does the task and comes back with its result, rather than building a Flow and testing it. Read each time it matters. */
export function automationStudioConversationAnswersFirst(): boolean {
  return resolveAutomationStudioBuildAuthoringMode("create") === "answer-first";
}
