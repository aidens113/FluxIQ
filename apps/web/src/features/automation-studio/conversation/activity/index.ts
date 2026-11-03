// Live activity in the chat: what Core is doing now, as `get-activity` answers
// it, held per unit of work. The chat widget reads it through the panel's
// activity port (`chat-widget/activity`) and tells the steps as FluxIQ's
// messages among the turns.

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
export { CONVERSATION_ACTIVITY_HOST_WORDS } from "./host-words";
export { CONVERSATION_ACTIVITY_HISTORY_LIMITS, holdConversationActivity, type ConversationActivityHistoryLimits } from "./history";
