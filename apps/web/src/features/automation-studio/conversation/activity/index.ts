// Live activity in the chat: what Core is doing now, read from `get-activity`,
// and where its rows sit among the thread's turns.

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
export {
  CONVERSATION_ACTIVITY_HELD,
  conversationActivityPollOutcome,
  conversationActivityStepText,
  interleaveConversationActivity,
  mergeConversationActivity,
  type ConversationThreadEntry
} from "./model";
export { getConversationActivity, type ConversationActivityQuery, type ConversationActivityReadResult } from "./queries";
export { useConversationActivity, type ConversationActivityState } from "./useConversationActivity";
