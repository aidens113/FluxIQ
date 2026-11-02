export { AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_PAGE_TOOL_ID, AUTOMATION_STUDIO_FLOW_DRAFT_DRY_RUN_ISSUE_CODE, AUTOMATION_STUDIO_FLOW_DRAFT_REPLAY_STATUSES, automationStudioFlowDraftReplayable, automationStudioFlowDraftReplayFrom, automationStudioFlowDraftReplaySignature, automationStudioFlowDraftDryRunVerdict, automationStudioFlowDraftReplayOutcomeBlocks, automationStudioFlowDraftReplayOutcomeKey, automationStudioFlowDraftDryRunIssueCodes, automationStudioFlowDraftReplayPassWords } from "../../../../runtime/flow-authoring/draft/index.ts";
export type { AutomationStudioFlowDraftReplayStatus, AutomationStudioFlowDraftStepReplay, AutomationStudioFlowDraftReplayOutcome, AutomationStudioFlowDraftReplayPass, AutomationStudioFlowDraftDryRun } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftDryRunFeedback as render } from "../../../../runtime/flow-authoring/draft/index.ts";
import { automationStudioFlowDraftPresentation } from "./presentation/index.ts";
export function automationStudioFlowDraftDryRunFeedback(verdict: Parameters<typeof render>[0], told: ReadonlySet<string> = new Set(), steps?: Parameters<typeof render>[3]): ReturnType<typeof render> {
  return render(verdict, automationStudioFlowDraftPresentation, told, steps);
}
