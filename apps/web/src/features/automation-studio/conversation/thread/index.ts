// The conversation itself: its records, how a transcript behaves, and what a
// person may answer. How a turn reaches the browser is the page's change stream
// (`features/panel-changes`, `GET /api/panel/changes`), not a poll.
//
// Nothing here renders. That is the point: the globally mounted prompt has to
// reach a person on every page of the product, and importing the Studio's
// conversation view to do it would ship the whole transcript, its composer and
// its re-authorization dialog into every route's first load.

export {
  CONVERSATION_TEXT_MAX,
  parseConversation,
  parseConversationAsk,
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
export { pendingConversationTurn } from "./model";
export { conversationSubjectLabel } from "./naming";
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
  CONVERSATION_DISMISSED_LIMIT,
  conversationPromptCopy,
  openConversationsFromPayload,
  promptableConversationTurn,
  withDismissedAsk
} from "./pending-asks";
export {
  CONVERSATION_PANEL_CAPABILITY_ATTACHMENT,
  CONVERSATION_PANEL_RESULT_ATTACHMENT,
  conversationPanelInvocation,
  type ConversationPanelInvocation
} from "./panel-records";
