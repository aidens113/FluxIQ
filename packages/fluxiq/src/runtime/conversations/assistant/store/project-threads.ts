// A project's conversation as the place the panel assistant works in (`./thread-store.ts`).
//
// Every chat belongs to a project, so the panel's chat in a project is a project conversation, which the
// panel and every client read. When that chat hands a message to the assistant, the assistant's steps,
// replies and Allow cards are written into this thread through the project's own conversations
// collaborator, exactly as Core writes any automation turn there, so they reach every reader the same way.
//
// The call a card waits on is kept in the person's own panel database, never in the project, so the card can
// be allowed only by the person whose message raised it; anyone else's press finds no call of theirs and is
// refused before the ask is settled (`../panel-assistant.ts`, `answerInProject`).
//
// A step that shows a record of this same project stores the reference the project's own resolver reads; one
// that refers into another project names that project, as a panel thread's would (`../attachments/`).

import type { AutomationStudioConversationAsk, AutomationStudioConversationAskInput } from "../../ask.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationAuthor, AutomationStudioConversationTurn } from "../../turn.ts";
import { panelAssistantAttachmentProjects } from "../attachments/index.ts";
import { PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT, type PanelAssistantTurnAttachment } from "../loop/index.ts";
import type { PanelAssistantThreadStore } from "./thread-store.ts";
import type { PanelAssistantWaitingCall } from "./waiting-calls.ts";

/** What the project's conversations collaborator (`../../conversations.ts`) gives this store. */
export type PanelAssistantProjectConversations = {
  appendTurn(input: { projectId: string; conversationId: string; text: string; actorId?: string | undefined; attachment?: AutomationStudioConversationAttachment | undefined }): Promise<AutomationStudioConversationTurn>;
  appendAutomationTurn(input: { projectId: string; conversationId: string; text: string; ask: AutomationStudioConversationAskInput | null; attachment: AutomationStudioConversationAttachment | null }): Promise<AutomationStudioConversationTurn>;
  recentTurns(input: { projectId: string; conversationId: string; count: number }): Promise<AutomationStudioConversationTurn[]>;
  getAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk | null>;
  answerAsk(input: { projectId: string; askId: string; kind: "grant" | "deny"; actorId?: string | undefined }): Promise<AutomationStudioConversationAsk>;
};

/** Where the person's waiting calls are kept: their own panel database (`./panel-threads.ts`). */
export type PanelAssistantPersonCalls = {
  keepWaitingCall(userId: string, call: PanelAssistantWaitingCall): Promise<void>;
  takeWaitingCall(userId: string, askId: string): Promise<PanelAssistantWaitingCall | null>;
  hasWaitingCall(userId: string, askId: string): Promise<boolean>;
};

export class PanelAssistantProjectThreads implements PanelAssistantThreadStore {
  constructor(private readonly projectId: string, private readonly conversations: PanelAssistantProjectConversations, private readonly calls: PanelAssistantPersonCalls) {}

  recent(_userId: string, conversationId: string, count: number): Promise<AutomationStudioConversationTurn[]> {
    return this.conversations.recentTurns({ projectId: this.projectId, conversationId, count });
  }

  append(_userId: string, input: { conversationId: string; author: AutomationStudioConversationAuthor; text: string; actorId?: string | null; attachment?: AutomationStudioConversationAttachment | null; ask?: AutomationStudioConversationAskInput | null }): Promise<AutomationStudioConversationTurn> {
    const { projectId } = this;
    if (input.author === "person") {
      if (input.ask) throw new Error("A person's turn carries no question.");
      return this.conversations.appendTurn({ projectId, conversationId: input.conversationId, text: input.text, ...(input.actorId ? { actorId: input.actorId } : {}), ...(input.attachment ? { attachment: input.attachment } : {}) });
    }
    return this.conversations.appendAutomationTurn({ projectId, conversationId: input.conversationId, text: input.text, ask: input.ask ?? null, attachment: input.attachment ?? null });
  }

  async appendCard(userId: string, input: { conversationId: string; text: string; ask: AutomationStudioConversationAskInput; call: Omit<PanelAssistantWaitingCall, "askId" | "conversationId"> }): Promise<AutomationStudioConversationTurn> {
    // Kept first: a card the person can see always has its call to run.
    await this.calls.keepWaitingCall(userId, { ...input.call, askId: input.ask.askId, conversationId: input.conversationId });
    return this.append(userId, { conversationId: input.conversationId, author: "automation", text: input.text, ask: input.ask });
  }

  getAsk(_userId: string, askId: string): Promise<AutomationStudioConversationAsk | null> {
    return this.conversations.getAsk({ projectId: this.projectId, askId });
  }

  answer(_userId: string, input: { askId: string; kind: "grant" | "deny"; actorId: string }): Promise<AutomationStudioConversationAsk> {
    return this.conversations.answerAsk({ projectId: this.projectId, askId: input.askId, kind: input.kind, actorId: input.actorId });
  }

  takeWaitingCall(userId: string, askId: string): Promise<PanelAssistantWaitingCall | null> {
    return this.calls.takeWaitingCall(userId, askId);
  }

  hasWaitingCall(userId: string, askId: string): Promise<boolean> {
    return this.calls.hasWaitingCall(userId, askId);
  }

  storedAttachment(attachment: PanelAssistantTurnAttachment): AutomationStudioConversationAttachment {
    if (attachment.kind === PANEL_ASSISTANT_CLIENT_ACTION_ATTACHMENT) return { kind: attachment.kind, ref: attachment.ref };
    if (attachment.projectId === this.projectId) return { kind: attachment.kind, ref: attachment.ref };
    return panelAssistantAttachmentProjects.stored(attachment);
  }
}
