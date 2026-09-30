// FluxIQ's step messages: one per thing Core decided, repaired or checked,
// with its reason and the actions it led to as cards.

export { conversationActivityIsInternal } from "./internal";
export {
  conversationStepMessages,
  type ConversationStepAction,
  type ConversationStepMessage,
  type ConversationStepMessageKind
} from "./messages";
export { conversationStepOutcomeWords, type ConversationStepOutcomeWords } from "./outcome";
