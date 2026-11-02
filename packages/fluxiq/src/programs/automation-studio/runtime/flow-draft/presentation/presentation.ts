import type { DraftPresentation } from "../../../../../runtime/flow-authoring/draft/presentation/index.ts";
import { automationStudioFlowDraftEntryInstruction } from "./entry.ts";
import { automationStudioFlowDraftFullRunInstruction } from "./full-run-required.ts";
import { automationStudioFlowDraftDryRunInstruction } from "./dry-run.ts";
import { automationStudioFlowDraftExcusedInstruction } from "./excused.ts";
import { automationStudioFlowDraftMissingPredecessorsInstruction } from "./missing-predecessors.ts";
import { automationStudioFlowDraftWithdrawalInstruction } from "./withdrawal.ts";

/** Compatibility text; downstream domain registration will replace browser-specific examples. */
export const automationStudioFlowDraftPresentation: DraftPresentation = {
  entryInstruction: automationStudioFlowDraftEntryInstruction,
  fullRunRequired: automationStudioFlowDraftFullRunInstruction,
  dryRunInstruction: automationStudioFlowDraftDryRunInstruction,
  excused: automationStudioFlowDraftExcusedInstruction,
  missingPredecessors: automationStudioFlowDraftMissingPredecessorsInstruction,
  withdrawal: automationStudioFlowDraftWithdrawalInstruction
};
