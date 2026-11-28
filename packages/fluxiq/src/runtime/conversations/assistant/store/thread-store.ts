// Where one message's work keeps its thread: what the assistant reads back and writes while it works.
//
// The person's own panel threads (`./panel-threads.ts`) are one place. A project's conversation is the
// other (`./project-threads.ts`): every chat now belongs to a project, so the panel's chat in a project gets
// the same work, written into the project's thread that the panel and every client read. Either way the
// first argument is the person the work is for, and the calls a card waits on are kept in that person's own
// database, so only they can run one.

import type { AutomationStudioConversationAsk, AutomationStudioConversationAskInput } from "../../ask.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationAuthor, AutomationStudioConversationTurn } from "../../turn.ts";
import type { PanelAssistantTurnAttachment } from "../loop/index.ts";
import type { PanelAssistantWaitingCall } from "./waiting-calls.ts";

export type PanelAssistantThreadStore = {
  /** The newest `count` turns of a thread, oldest first: what the model reads. */
  recent(userId: string, conversationId: string, count: number): Promise<AutomationStudioConversationTurn[]>;
  /** Appends one turn, and the ask it carries. */
  append(userId: string, input: { conversationId: string; author: AutomationStudioConversationAuthor; text: string; actorId?: string | null; attachment?: AutomationStudioConversationAttachment | null; ask?: AutomationStudioConversationAskInput | null }): Promise<AutomationStudioConversationTurn>;
  /** Appends a confirm card and keeps the exact call it asks about, in the person's own database. */
  appendCard(userId: string, input: { conversationId: string; text: string; ask: AutomationStudioConversationAskInput; call: Omit<PanelAssistantWaitingCall, "askId" | "conversationId"> }): Promise<AutomationStudioConversationTurn>;
  /** One ask in this place, or null. */
  getAsk(userId: string, askId: string): Promise<AutomationStudioConversationAsk | null>;
  /** Settles one ask with the person's answer. A second, different answer is refused by the store. */
  answer(userId: string, input: { askId: string; kind: "grant" | "deny"; actorId: string }): Promise<AutomationStudioConversationAsk>;
  /** Takes the call a card of this person's waits on, once. */
  takeWaitingCall(userId: string, askId: string): Promise<PanelAssistantWaitingCall | null>;
  /** Whether a call of this person's still waits on `askId`. */
  hasWaitingCall(userId: string, askId: string): Promise<boolean>;
  /** The attachment a step's turn stores here: a project-bound one names its project wherever the place cannot. */
  storedAttachment(attachment: PanelAssistantTurnAttachment): AutomationStudioConversationAttachment;
};
