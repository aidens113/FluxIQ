// What a person writes back: a reply, and an answer to an ask.
//
// Both are mutations to the request coordinator (`append-turn` by its prefix,
// `answer-ask` because it is not a read), so both get thirty seconds, no
// retry and no deduplication. Retrying an answer would be wrong anyway: an ask
// is answered once and a second answer is refused.

import type { ProgramCommandTransport } from "../data/program-transport";
import { commitAutomationStudioMutation } from "../stores";
import type { ConversationAnswer } from "./thread";

export type ConversationAppendTurnPayload = {
  conversationId: string;
  text: string;
};

export type ConversationAnswerAskPayload = {
  conversationId: string;
  answer: ConversationAnswer;
  /** Present only when the answer was re-authorized, and never logged or echoed. */
  authorizationPin?: string;
};

export function appendConversationTurn(api: ProgramCommandTransport, payload: ConversationAppendTurnPayload) {
  return api.post<{ turn?: unknown }>("append-turn", { ...payload });
}

export function answerConversationAsk(api: ProgramCommandTransport, payload: ConversationAnswerAskPayload) {
  return api.post<{ turn?: unknown; ask?: unknown }>("answer-ask", {
    conversationId: payload.conversationId,
    answer: { ...payload.answer },
    ...(payload.authorizationPin ? { authorizationPin: payload.authorizationPin } : {})
  });
}

/**
 * Tell every other mounted surface that this thread moved. The change feed
 * only fires on a mutation this tab dispatched, so without this a second
 * conversation view in another pane would not see the turn until it polled.
 */
export function commitConversationChanged(detail: { projectId: string | null; conversationId: string; flowId?: string }): void {
  commitAutomationStudioMutation({
    kind: "conversation.changed",
    projectId: detail.projectId,
    conversationId: detail.conversationId,
    ...(detail.flowId ? { flowId: detail.flowId } : {})
  });
}
