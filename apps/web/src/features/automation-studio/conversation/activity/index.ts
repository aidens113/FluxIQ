// Live activity in the chat: what Core is doing now, read from `get-activity`,
// held per unit of work, and told as FluxIQ's step messages among the turns.

export {
  parseConversationActivitySnapshot,
  type ConversationActivity,
  type ConversationActivityDetail,
  type ConversationActivityDetailKind,
  type ConversationActivityDetailStatus,
  type ConversationActivityPhase,
  type ConversationActivityResolution,
  type ConversationActivitySnapshot,
  type ConversationActivityStep
} from "./contracts";
export { CONVERSATION_ACTIVITY_HISTORY_LIMITS, holdConversationActivity, type ConversationActivityHistoryLimits } from "./history";
export { conversationActivityPollOutcome, conversationActivityStepText } from "./model";
export { getConversationActivity, type ConversationActivityQuery, type ConversationActivityReadResult } from "./queries";
export { useConversationActivity, type ConversationActivityState } from "./useConversationActivity";
export { ConversationPacedStatus, type ConversationActivityDisplay, type ConversationActivityOutcome } from "./paced-status";
export {
  conversationActivityIsInternal,
  conversationActivitySentence,
  conversationActivityTextIsHuman,
  conversationStepMessages,
  conversationStepOutcomeWords,
  type ConversationStepAction,
  type ConversationStepMessage,
  type ConversationStepMessageKind,
  type ConversationStepOutcomeWords
} from "./steps";
export { conversationStream, type ConversationStreamEntry } from "./stream";
export { usePacedConversationActivity } from "./usePacedConversationActivity";
