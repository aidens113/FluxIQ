"use client";

// The view's seam onto the Program API, in the shape every other Studio view
// uses: a model the connector selects, commands the workspace injects, and a
// hook that binds the commands to the transport. `ConversationViewContent`
// takes the commands as props, so a test mounts it with doubles and never
// touches a transport.

import { useMemo } from "react";
import { useProgramTransport } from "../data/use-program-transport";
import {
  getConversation,
  getConversationAttachment,
  listConversations,
  type ConversationAttachmentQuery,
  type ConversationDetailQuery,
  type ConversationListQuery
} from "./turn-queries";
import {
  answerConversationAsk,
  appendConversationTurn,
  type ConversationAnswerAskPayload,
  type ConversationAppendTurnPayload
} from "./turn-commands";

export type ConversationViewHostModel = {
  projectId: string | null;
  flow?: any;
  /** Restored from the saved workspace state so a warm tab reopens on the same thread. */
  requestedConversationId?: string;
};

export type ConversationViewHostCommands = {
  onSelectedConversationChange?(conversationId: string): void;
  onOpenAttachment?(attachment: { kind: string; ref: string }): void;
};

export type ConversationCommands = {
  listConversations(payload: ConversationListQuery, signal?: AbortSignal): ReturnType<typeof listConversations>;
  loadConversation(payload: ConversationDetailQuery, signal?: AbortSignal): ReturnType<typeof getConversation>;
  appendTurn(payload: ConversationAppendTurnPayload): ReturnType<typeof appendConversationTurn>;
  answerAsk(payload: ConversationAnswerAskPayload): ReturnType<typeof answerConversationAsk>;
  /** Optional: absent means an attachment renders as a reference rather than in place. */
  loadAttachment?(payload: ConversationAttachmentQuery, signal?: AbortSignal): ReturnType<typeof getConversationAttachment>;
};

export function useConversationCommands(): ConversationCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    listConversations: (payload, signal) => listConversations(transport, payload, signal),
    loadConversation: (payload, signal) => getConversation(transport, payload, signal),
    appendTurn: (payload) => appendConversationTurn(transport, payload),
    answerAsk: (payload) => answerConversationAsk(transport, payload),
    loadAttachment: (payload, signal) => getConversationAttachment(transport, payload, signal)
  }), [transport]);
}
