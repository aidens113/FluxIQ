import type { AutomationStudioLlmTaskRequest } from "../../harness/index.ts";
import { automationStudioLlmTaskOutputSchema } from "../output-schema.ts";
import { automationStudioLlmDecisionTools } from "./decision-tools.ts";
import type { AutomationStudioLlmDecisionTools } from "./types.ts";

/** The decision tools of an evidence decision request (`./decision-tools.ts`), or `undefined` for any other task or a schema they cannot express. */
export function automationStudioLlmRequestDecisionTools(request: AutomationStudioLlmTaskRequest): AutomationStudioLlmDecisionTools | undefined {
  if (request.taskKind !== "evidence_tool_decision" || !request.context.evidenceLoop) return undefined;
  return automationStudioLlmDecisionTools(automationStudioLlmTaskOutputSchema(request));
}
