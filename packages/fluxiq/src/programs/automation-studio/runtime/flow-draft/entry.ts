export { AUTOMATION_STUDIO_FLOW_DRAFT_TOOL_ID } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftEntry as render } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftPresentation } from "./presentation/index.ts";
export function automationStudioFlowDraftEntry(input: Parameters<typeof render>[0]): ReturnType<typeof render> {
  return render(input, automationStudioFlowDraftPresentation);
}
