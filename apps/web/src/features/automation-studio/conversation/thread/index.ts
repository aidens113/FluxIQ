// The conversation itself: its records, how a transcript behaves, what a
// person may answer, and how a turn reaches a browser nothing can push to.
//
// Nothing here renders. That is the point: the globally mounted prompt has to
// reach a person on every page of the product, and importing the Studio's
// conversation view to do it would ship the whole transcript, its composer and
// its re-authorization dialog into every route's first load.

export {
  CONVERSATION_TEXT_MAX,
  parseConversation,
  parseConversations,
  parseConversationTurn,
  parseConversationTurns,
  type AutomationStudioActionConsequence,
  type Conversation,
  type ConversationAnswer,
  type ConversationAnswerKind,
  type ConversationAsk,
  type ConversationAskKind,
  type ConversationAskOption,
  type ConversationAskStatus,
  type ConversationAttachment,
  type ConversationStatus,
  type ConversationSubjectKind,
  type ConversationTurn,
  type ConversationTurnAuthor
} from "./contracts";
export {
  CONVERSATION_TAIL_SLACK_PX,
  CONVERSATION_VISIBLE_TURNS,
  conversationFollowsTail,
  conversationSubjectDetail,
  conversationSubjectFallbackLabel,
  conversationSubjectLabel,
  latestConversationTurnId,
  mergeConversationTurns,
  pendingConversationTurn,
  sortConversationsForThreadList,
  unansweredConversationCount,
  visibleConversationTurns
} from "./model";
export {
  conversationAnswerNeedsReauthorization,
  conversationAnswerRequest,
  conversationAskConsequences,
  conversationAskPresentation,
  conversationAuthorizationCopy,
  type ConversationAnswerAction,
  type ConversationAskPresentation
} from "./answers";
export {
  CONVERSATION_POLL_CEILING_MS,
  CONVERSATION_POLL_FAST_MS,
  CONVERSATION_POLL_HIDDEN_MS,
  createBackoffPoller,
  nextConversationPollDelayMs,
  type BackoffPoller,
  type ConversationPollOutcome
} from "./poller";
export {
  CONVERSATION_DISMISSED_LIMIT,
  conversationPromptCopy,
  openConversationsFromPayload,
  promptableConversationTurn,
  withDismissedAsk
} from "./pending-asks";
