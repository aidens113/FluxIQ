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
export { conversationActivityHeadline, conversationActivityOutcome, type ConversationActivityOutcome } from "./headline";
export {
  CONVERSATION_ACTIVITY_DETAIL_INTERVAL_MS,
  ConversationActivityPacer,
  type ConversationActivityClock,
  type ConversationActivityDisplay
} from "./pacer";
export { conversationActivityDuration, conversationStream, type ConversationActivityGroup, type ConversationStreamEntry } from "./stream";
export { usePacedConversationActivity } from "./usePacedConversationActivity";
export { conversationActivitySentence, conversationActivityTextIsHuman } from "./wording";
