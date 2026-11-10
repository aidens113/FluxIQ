// Panel threads: the workspace-level conversation store, outside every project.
//
// The same store class and rows as a project's thread
// (`AutomationStudioProjectConversationStore.openReserved`), over a pool of its
// own whose root is beside the projects' (`<automation data>/panel-assistant`),
// one database per person (`./database-id.ts`). A thread is the person's
// because it is in their database: every method takes the user id the request
// was signed in as, never one from a payload, so nobody reaches another's.
//
// What a reader gets is a panel thread: subject `panel`, and `projectId`
// `panel`, since it belongs to no project. The database's own id is never shown.

import { randomUUID } from "node:crypto";
import { AutomationStudioProjectDatabasePool } from "../../../../framework/persistence/automation/index.ts";
import type { AutomationStudioConversationAsk, AutomationStudioConversationAskInput } from "../../ask.ts";
import { AutomationStudioProjectConversationStore } from "../../store.ts";
import type { AutomationStudioConversation } from "../../thread.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationAuthor, AutomationStudioConversationTurn } from "../../turn.ts";
import type { PanelAssistantConversation, PanelAssistantThread } from "../types.ts";
import { panelAssistantDatabaseId } from "./database-id.ts";
import { PANEL_ASSISTANT_STORE_MIGRATIONS } from "./migrations.ts";
import { PanelAssistantWaitingCalls, type PanelAssistantWaitingCall } from "./waiting-calls.ts";

/** The subject and the project id every panel thread reads back with. */
const PANEL = "panel";

/** One person's panel database, open for one operation. */
type Opened = { threads: AutomationStudioProjectConversationStore; waiting: PanelAssistantWaitingCalls };

export class PanelAssistantThreads {
  private readonly pool: AutomationStudioProjectDatabasePool;
  private readonly now: () => number;

  /** `rootDir` holds the panel databases and nothing else; it must not be the projects' root. */
  constructor(options: { rootDir: string; idleCloseMs?: number; now?: () => number }) {
    this.pool = new AutomationStudioProjectDatabasePool({ rootDir: options.rootDir, ...(options.idleCloseMs === undefined ? {} : { idleCloseMs: options.idleCloseMs }) });
    this.now = options.now ?? Date.now;
  }

  /** A new thread, or the one `conversationId` already names. */
  open(userId: string, input: { conversationId?: string; title?: string | null }): Promise<PanelAssistantConversation> {
    const conversationId = input.conversationId ?? `conversation.${randomUUID()}`;
    return this.with(userId, async ({ threads }) => panelConversation(await threads.openConversation({
      mutationId: `conversation.open:${conversationId}`,
      conversationId,
      subjectKind: "panel",
      subjectId: PANEL,
      title: input.title ?? null
    })));
  }

  /** The person's threads, most recently touched first. */
  list(userId: string, input: { limit?: unknown } = {}): Promise<PanelAssistantConversation[]> {
    return this.with(userId, async ({ threads }) => (await threads.listConversations({ limit: input.limit })).map(panelConversation));
  }

  /** One thread and its turns (after `sinceTurnId` when given), or null when the person has no such thread. */
  read(userId: string, input: { conversationId: string; sinceTurnId?: string; limit?: unknown }): Promise<PanelAssistantThread | null> {
    return this.with(userId, async ({ threads }) => {
      const thread = await threads.getConversation({ conversationId: input.conversationId, limit: input.limit, ...(input.sinceTurnId === undefined ? {} : { sinceTurnId: input.sinceTurnId }) });
      return thread ? { ...thread, conversation: panelConversation(thread.conversation) } : null;
    });
  }

  /** The newest `count` turns of a thread, oldest first: what the model reads. */
  recent(userId: string, conversationId: string, count: number): Promise<AutomationStudioConversationTurn[]> {
    return this.with(userId, ({ threads }) => threads.recentTurns(conversationId, count));
  }

  /** Appends one turn, and the ask it carries. */
  append(userId: string, input: { conversationId: string; author: AutomationStudioConversationAuthor; text: string; actorId?: string | null; attachment?: AutomationStudioConversationAttachment | null; ask?: AutomationStudioConversationAskInput | null }): Promise<AutomationStudioConversationTurn> {
    const turnId = `turn.${randomUUID()}`;
    return this.with(userId, ({ threads }) => threads.appendTurn({
      mutationId: `conversation.turn:${turnId}`,
      conversationId: input.conversationId,
      turnId,
      author: input.author,
      text: input.text,
      actorId: input.actorId ?? null,
      attachment: input.attachment ?? null,
      ask: input.ask ?? null
    }));
  }

  /** Appends a confirm card and keeps the exact call it asks about, so Allow runs that call and no other, with the words and place it was raised under. */
  async appendCard(userId: string, input: { conversationId: string; text: string; ask: AutomationStudioConversationAskInput; call: Omit<PanelAssistantWaitingCall, "askId" | "conversationId"> }): Promise<AutomationStudioConversationTurn> {
    // Kept first: a card the person can see always has its call to run.
    await this.with(userId, ({ waiting }) => waiting.put({ ...input.call, askId: input.ask.askId, conversationId: input.conversationId }, this.now()));
    return this.append(userId, { conversationId: input.conversationId, author: "automation", text: input.text, ask: input.ask });
  }

  /** One ask in the person's threads, or null. */
  getAsk(userId: string, askId: string): Promise<AutomationStudioConversationAsk | null> {
    return this.with(userId, ({ threads }) => threads.getAsk(askId));
  }

  /** Settles one ask with the person's answer. A second, different answer is refused by the store. */
  answer(userId: string, input: { askId: string; kind: "grant" | "deny"; actorId: string }): Promise<AutomationStudioConversationAsk> {
    return this.with(userId, ({ threads }) => threads.answerAsk({ mutationId: `conversation.answer:${input.askId}:${input.kind}`, askId: input.askId, kind: input.kind, value: null, actorId: input.actorId }));
  }

  /** Takes the call a card waits on, once; null when none waits or another press took it. */
  takeWaitingCall(userId: string, askId: string): Promise<PanelAssistantWaitingCall | null> {
    return this.with(userId, ({ waiting }) => waiting.take(askId, this.now()));
  }

  /** Closes every open database. */
  close(): Promise<void> {
    return this.pool.closeAll();
  }

  private async with<TResult>(userId: string, operation: (opened: Opened) => Promise<TResult>): Promise<TResult> {
    const databaseId = panelAssistantDatabaseId(userId);
    const threads = await AutomationStudioProjectConversationStore.openReserved({ pool: this.pool, databaseId, migrations: PANEL_ASSISTANT_STORE_MIGRATIONS });
    try {
      const waiting = await PanelAssistantWaitingCalls.open({ pool: this.pool, databaseId });
      try {
        return await operation({ threads, waiting });
      } finally {
        await waiting.close();
      }
    } finally {
      await threads.close();
    }
  }
}

/** A stored thread as a panel thread: subject `panel`, project `panel`. */
function panelConversation(conversation: AutomationStudioConversation): PanelAssistantConversation {
  return { ...conversation, projectId: PANEL, subject: { kind: "panel", id: PANEL } };
}
