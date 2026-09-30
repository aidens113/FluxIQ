// Live activity in the chat: what Core is doing now, read from `get-activity`,
// held per unit of work, and told as FluxIQ's step messages among the turns.

export {
  parseConversationActivitySnapshot,
  type ConversationActivity,
  type ConversationActivityDetail,
  type ConversationActivityDetailKind,
  type ConversationActivityDetailStatus,
  type ConversationActivityPhase,
  type ConversationActivitySnapshot,
  type ConversationActivityStep
} from "./contracts";
export { CONVERSATION_ACTIVITY_HISTORY_LIMITS, holdConversationActivity, type ConversationActivityHistoryLimits } from "./history";
export { conversationActivityPollOutcome, conversationActivityStepText } from "./model";
export { getConversationActivity, type ConversationActivityQuery, type ConversationActivityReadResult } from "./queries";
export { useConversationActivity, type ConversationActivityState } from "./useConversationActivity";
export { conversationActivityHeadline, conversationActivityOutcome, type ConversationActivityOutcome } from "./headline";
export {
  CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS,
  ConversationActivityPacer,
  type ConversationActivityClock,
  type ConversationActivityDisplay
} from "./pacer";
export {
  conversationActivityIsInternal,
  conversationStepMessages,
  conversationStepOutcomeWords,
  type ConversationStepAction,
  type ConversationStepMessage,
  type ConversationStepMessageKind,
  type ConversationStepOutcomeWords
} from "./steps";
export { conversationStream, type ConversationStreamEntry } from "./stream";
export { usePacedConversationActivity } from "./usePacedConversationActivity";
export { conversationActivitySentence, conversationActivityTextIsHuman } from "./wording";
