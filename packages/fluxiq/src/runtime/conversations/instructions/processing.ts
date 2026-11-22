import { readAutomationStudioFlowTaskProcessing, type AutomationStudioFlowTaskProcessing } from "../../flow-authoring/draft/index.ts";
import { automationStudioConversationAnswerRecord } from "./answer-record.ts";

/** The same interpretation answer declares the data conditions once. Omission or malformed input on a NEW interpretation is missing evidence, never a legacy bypass or action-only declaration. */
export function automationStudioConversationDeclaredProcessing(raw: unknown): AutomationStudioFlowTaskProcessing {
  const answer = automationStudioConversationAnswerRecord(raw);
  if (!answer || answer === "unreadable" || !Object.hasOwn(answer, "process")) return {};
  return answer.process === null ? null : readAutomationStudioFlowTaskProcessing({ process: answer.process }) ?? {};
}
