// FluxIQ's step messages: one per thing Core decided, repaired or checked,
// with its reason and a quiet line saying how the action went.

export { conversationActivityIsInternal } from "./internal";
export {
  conversationStepMessages,
  type ConversationStepMessage,
  type ConversationStepMessageKind,
  type ConversationStepOutcome
} from "./messages";
export { conversationStepOutcomeWords, type ConversationStepOutcomeWords } from "./outcome";
