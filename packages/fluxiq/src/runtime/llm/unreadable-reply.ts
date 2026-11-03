// Compatibility exports; generic model and agent mechanics belong to the framework runtime.
export {
  AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_DEFAULT_MAX_UNREADABLE_REPLIES_IN_A_ROW,
  automationStudioLlmReplyUnreadable,
  automationStudioLlmUnreadableReplySaid,
  automationStudioLlmUnreadableReplies
} from "../models/failures/index.ts";
export type {
  AutomationStudioLlmEvidenceLoopUnreadable,
  AutomationStudioLlmUnreadableReplies
} from "../models/failures/index.ts";
