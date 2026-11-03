// Core's question, in the words the Studio always used for it: what it is
// asking, what an answer would commit, and which answers have a lasting effect
// and so ask for the PIN first. The words are the thread domain's
// (`automation-studio/conversation/thread/answers.ts`); this only hands them to
// the chat in the shape its ask port reads.

import type { ChatAskAction, ChatAskPresentation } from "@fluxiq/ui-components";
import {
  CONVERSATION_TEXT_MAX,
  conversationAnswerNeedsReauthorization,
  conversationAnswerRequest,
  conversationAskPresentation,
  conversationAuthorizationCopy,
  parseConversationAsk,
  type ConversationAnswerAction,
  type ConversationAsk
} from "../../automation-studio/conversation";

const TEXT_HINT = "Answer in your own words. FluxIQ reads this on its next turn.";

/** The question `record` is, or null when it is not one the thread domain can read (the chat then draws its own). */
export function presentAsk(record: unknown): ChatAskPresentation | null {
  const ask = parseConversationAsk(record);
  if (!ask) return null;
  const presentation = conversationAskPresentation(ask);
  const control = ask.control?.name ? `The control is "${ask.control.name}"${ask.control.kind ? ` (${ask.control.kind})` : ""}.` : null;
  return {
    title: presentation.title,
    description: presentation.description,
    consequences: presentation.consequencePhrases,
    ...(control ? { note: control } : {}),
    actions: presentation.actions.map((action) => chatAction(ask, action)),
    takesText: presentation.takesText,
    ...(presentation.takesText ? { textHint: TEXT_HINT, textMax: CONVERSATION_TEXT_MAX } : {})
  };
}

function chatAction(ask: ConversationAsk, action: ConversationAnswerAction): ChatAskAction {
  const request = conversationAnswerRequest(action.answer);
  return {
    id: action.actionId,
    label: action.label,
    description: action.description,
    tone: action.variant,
    kind: request.kind,
    ...(request.value === undefined ? {} : { value: request.value }),
    ...(conversationAnswerNeedsReauthorization(action) ? { reauthorize: conversationAuthorizationCopy(ask, action) } : {})
  };
}
