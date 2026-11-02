export { automationStudioFlowDraftExemptStepIds } from "../../../../runtime/flow-authoring/draft/index.ts";
export type { AutomationStudioFlowDraftExcusedReason } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftExcusedWords as render } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftPresentation } from "./presentation/index.ts";
export function automationStudioFlowDraftExcusedWords(input: Parameters<typeof render>[0]): ReturnType<typeof render> {
  return render(input, automationStudioFlowDraftPresentation);
}
