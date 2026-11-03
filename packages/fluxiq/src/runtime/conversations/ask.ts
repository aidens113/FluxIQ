// Compatibility exports; the framework owns ask contracts.
export {
  AUTOMATION_STUDIO_CONVERSATION_ASK_KINDS,
  AUTOMATION_STUDIO_CONVERSATION_ASK_STATUSES,
  AUTOMATION_STUDIO_CONVERSATION_ANSWER_KINDS,
  AUTOMATION_STUDIO_CONVERSATION_ASK_TIMEOUT_ACTIONS,
  automationStudioConversationAnswerFits,
  automationStudioConversationAskRoute,
  AUTOMATION_STUDIO_CONVERSATION_CONSEQUENTIAL_CLASSES,
  automationStudioConversationAskIsConsequential
} from "../interaction/index.ts";
export type {
  AutomationStudioConversationAskKind,
  AutomationStudioConversationAskStatus,
  AutomationStudioConversationAnswerKind,
  AutomationStudioConversationAskTimeoutAction,
  AutomationStudioConversationAskOption,
  AutomationStudioConversationAskRoutes,
  AutomationStudioConversationAskControl,
  AutomationStudioConversationAnswer,
  AutomationStudioConversationAsk,
  AutomationStudioConversationAskInput
} from "../interaction/index.ts";
