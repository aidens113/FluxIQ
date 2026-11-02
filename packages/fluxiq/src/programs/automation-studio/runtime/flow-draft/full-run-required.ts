export { AUTOMATION_STUDIO_FLOW_DRAFT_FULL_RUN_REQUIRED_CODE } from "../../../../runtime/flow-authoring/draft/index.ts";
export type { AutomationStudioFlowDraftUnrunnableWord } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftFullRunRequiredFeedback as render } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftPresentation } from "./presentation/index.ts";
export function automationStudioFlowDraftFullRunRequiredFeedback(input: Parameters<typeof render>[0]): ReturnType<typeof render> {
  return render(input, automationStudioFlowDraftPresentation);
}
