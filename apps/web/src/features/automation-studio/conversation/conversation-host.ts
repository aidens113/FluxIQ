"use client";

// The conversation's seam onto the Program API: commands the surface injects
// and a hook that binds them to the transport. `ConversationViewContent` takes
// the commands as props, so a test mounts it with doubles and never touches a
// transport.
//
// `runCapability` and `describeCapabilities` are what make the window operate
// the panel. They are on the same seam as the reads and the turn write, so a
// surface that already takes these commands gains the whole control panel
// without learning a second way to reach it, and a test drives a capability
// with a double exactly as it drives a turn.

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
  runConversationCapability,
  startConversation,
  type ConversationAnswerAskPayload,
  type ConversationAppendTurnPayload,
  type ConversationCapabilityPayload,
  type ConversationOpenPayload
} from "./turn-commands";
import { describePanelCapabilities, panelCapabilityVocabulary, type PanelCapabilityDescription } from "./capabilities";

export type ConversationViewHostModel = {
  /** The project whose threads are listed, or null to list across every project the person can see. */
  projectId: string | null;
  /** Restored by whatever mounted the surface, so it reopens on the same thread. */
  requestedConversationId?: string;
};

export type ConversationViewHostCommands = {
  onSelectedConversationChange?(conversationId: string): void;
  onOpenAttachment?(attachment: { kind: string; ref: string }): void;
};

export type ConversationCommands = {
  listConversations(payload: ConversationListQuery, signal?: AbortSignal): ReturnType<typeof listConversations>;
  loadConversation(payload: ConversationDetailQuery, signal?: AbortSignal): ReturnType<typeof getConversation>;
  /**
   * Start a thread. Until Core registered `open-conversation` on 2026-09-28 a
   * person could not open one at all - only a run, a build or a node could -
   * so the composer sat permanently disabled on a project that had said
   * nothing yet.
   */
  startConversation(payload: ConversationOpenPayload): ReturnType<typeof startConversation>;
  appendTurn(payload: ConversationAppendTurnPayload): ReturnType<typeof appendConversationTurn>;
  answerAsk(payload: ConversationAnswerAskPayload): ReturnType<typeof answerConversationAsk>;
  /** Do something in the panel, from the thread, and record it there. */
  runCapability(payload: ConversationCapabilityPayload): ReturnType<typeof runConversationCapability>;
  /**
   * Everything the panel can be asked for, read from the registry. Nothing
   * answers "what can you do?" from a list written by hand.
   */
  describeCapabilities(): { prose: string; vocabulary: PanelCapabilityDescription[] };
  /** Optional: absent means an attachment renders as a reference rather than in place. */
  loadAttachment?(payload: ConversationAttachmentQuery, signal?: AbortSignal): ReturnType<typeof getConversationAttachment>;
};

export function useConversationCommands(): ConversationCommands {
  const transport = useProgramTransport("automation-studio");
  return useMemo(() => ({
    listConversations: (payload, signal) => listConversations(transport, payload, signal),
    loadConversation: (payload, signal) => getConversation(transport, payload, signal),
    startConversation: (payload) => startConversation(transport, payload),
    appendTurn: (payload) => appendConversationTurn(transport, payload),
    answerAsk: (payload) => answerConversationAsk(transport, payload),
    runCapability: (payload) => runConversationCapability(transport, payload),
    describeCapabilities: () => ({ prose: describePanelCapabilities(), vocabulary: panelCapabilityVocabulary() }),
    loadAttachment: (payload, signal) => getConversationAttachment(transport, payload, signal)
  }), [transport]);
}
