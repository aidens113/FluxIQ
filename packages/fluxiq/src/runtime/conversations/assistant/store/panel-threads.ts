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
import type { AutomationStudioConversationSignalSink } from "../../signals/index.ts";
import { AutomationStudioProjectConversationStore } from "../../store.ts";
import type { AutomationStudioConversation } from "../../thread.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationAuthor, AutomationStudioConversationTurn } from "../../turn.ts";
import { panelAssistantAttachmentProjects } from "../attachments/index.ts";
import type { PanelAssistantTurnAttachment } from "../loop/index.ts";
import type { PanelAssistantConversation, PanelAssistantThread } from "../types.ts";
import { panelAssistantDatabaseId } from "./database-id.ts";
import { PANEL_ASSISTANT_STORE_MIGRATIONS } from "./migrations.ts";
import type { PanelAssistantThreadStore } from "./thread-store.ts";
import { PanelAssistantWaitingCalls, type PanelAssistantWaitingCall } from "./waiting-calls.ts";

/** The subject and the project id every panel thread reads back with. */
const PANEL = "panel";

/** One person's panel database, open for one operation. */
type Opened = { threads: AutomationStudioProjectConversationStore; waiting: PanelAssistantWaitingCalls };

export class PanelAssistantThreads implements PanelAssistantThreadStore {
  private readonly pool: AutomationStudioProjectDatabasePool;
  private readonly now: () => number;
  private readonly signals: AutomationStudioConversationSignalSink | undefined;

  /**
   * `rootDir` holds the panel databases and nothing else; it must not be the
   * projects' root. `signals` hears each committed write as a change to the
   * person's thread (scope `panel` with their user id), so their panel hears a
   * turn the assistant's work wrote by push.
   */
  constructor(options: { rootDir: string; idleCloseMs?: number; now?: () => number; signals?: AutomationStudioConversationSignalSink }) {
    this.pool = new AutomationStudioProjectDatabasePool({ rootDir: options.rootDir, ...(options.idleCloseMs === undefined ? {} : { idleCloseMs: options.idleCloseMs }) });
    this.now = options.now ?? Date.now;
    this.signals = options.signals;
  }

  /** A new thread, or the one `conversationId` already names. */
  open(userId: string, input: { conversationId?: string; title?: string | null }): Promise<PanelAssistantConversation> {
    const conversationId = input.conversationId ?? `conversation.${randomUUID()}`;
    return this.with(userId, async ({ threads }) => panelConversation(this.signalled(userId, await threads.openConversation({
      mutationId: `conversation.open:${conversationId}`,
      conversationId,
      subjectKind: "panel",
      subjectId: PANEL,
      title: input.title ?? null
    }))));
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

  /** One turn of a thread, or null when the person has no such thread or the thread no such turn. */
  turn(userId: string, input: { conversationId: string; turnId: string }): Promise<AutomationStudioConversationTurn | null> {
    return this.with(userId, ({ threads }) => threads.getTurn(input.conversationId, input.turnId));
  }

  /** Gives a thread the person's own name; the store refuses a thread they do not have as `conversation_not_found`. */
  rename(userId: string, input: { conversationId: string; title: string }): Promise<PanelAssistantConversation> {
    return this.with(userId, async ({ threads }) => panelConversation(this.signalled(userId, await threads.renameConversation({ mutationId: `conversation.rename:${randomUUID()}`, conversationId: input.conversationId, title: input.title }))));
  }

  /**
   * Removes a thread with its turns, its asks, the records that carried them
   * and the calls its cards waited on (`./migrations.ts`, `9004`), in one
   * transaction. Each removal is its own mutation, so a thread opened again
   * under the same id can be removed again.
   */
  delete(userId: string, input: { conversationId: string }): Promise<{ deleted: true; conversationId: string }> {
    return this.with(userId, async ({ threads }) => this.signalled(userId, await threads.deleteConversation({ mutationId: `conversation.delete:${randomUUID()}`, conversationId: input.conversationId })));
  }

  /** The newest `count` turns of a thread, oldest first: what the model reads. */
  recent(userId: string, conversationId: string, count: number): Promise<AutomationStudioConversationTurn[]> {
    return this.with(userId, ({ threads }) => threads.recentTurns(conversationId, count));
  }

  /** Appends one turn, and the ask it carries. */
  append(userId: string, input: { conversationId: string; author: AutomationStudioConversationAuthor; text: string; actorId?: string | null; attachment?: AutomationStudioConversationAttachment | null; ask?: AutomationStudioConversationAskInput | null }): Promise<AutomationStudioConversationTurn> {
    const turnId = `turn.${randomUUID()}`;
    return this.with(userId, async ({ threads }) => this.signalled(userId, await threads.appendTurn({
      mutationId: `conversation.turn:${turnId}`,
      conversationId: input.conversationId,
      turnId,
      author: input.author,
      text: input.text,
      actorId: input.actorId ?? null,
      attachment: input.attachment ?? null,
      ask: input.ask ?? null
    })));
  }

  /** Appends a confirm card and keeps the exact call it asks about, so Allow runs that call and no other, with the words and place it was raised under. */
  async appendCard(userId: string, input: { conversationId: string; text: string; ask: AutomationStudioConversationAskInput; call: Omit<PanelAssistantWaitingCall, "askId" | "conversationId"> }): Promise<AutomationStudioConversationTurn> {
    // Kept first: a card the person can see always has its call to run.
    await this.keepWaitingCall(userId, { ...input.call, askId: input.ask.askId, conversationId: input.conversationId });
    return this.append(userId, { conversationId: input.conversationId, author: "automation", text: input.text, ask: input.ask });
  }

  /** One ask in the person's threads, or null. */
  getAsk(userId: string, askId: string): Promise<AutomationStudioConversationAsk | null> {
    return this.with(userId, ({ threads }) => threads.getAsk(askId));
  }

  /** Settles one ask with the person's answer. A second, different answer is refused by the store. */
  answer(userId: string, input: { askId: string; kind: "grant" | "deny"; actorId: string }): Promise<AutomationStudioConversationAsk> {
    return this.with(userId, async ({ threads }) => this.signalled(userId, await threads.answerAsk({ mutationId: `conversation.answer:${input.askId}:${input.kind}`, askId: input.askId, kind: input.kind, value: null, actorId: input.actorId })));
  }

  /**
   * Keeps the exact call a card asks about in the person's own database. A card the assistant raises in a
   * project's thread keeps its call here too (`./project-threads.ts`), so only the person whose message raised
   * it can ever run it.
   */
  keepWaitingCall(userId: string, call: PanelAssistantWaitingCall): Promise<void> {
    return this.with(userId, ({ waiting }) => waiting.put(call, this.now()));
  }

  /** Whether a call of this person's still waits on `askId`. */
  hasWaitingCall(userId: string, askId: string): Promise<boolean> {
    return this.with(userId, ({ waiting }) => waiting.waiting(askId));
  }

  /** Takes the call a card waits on, once; null when none waits or another press took it. */
  takeWaitingCall(userId: string, askId: string): Promise<PanelAssistantWaitingCall | null> {
    return this.with(userId, ({ waiting }) => waiting.take(askId, this.now()));
  }

  /** A panel thread belongs to no project, so a step that shows a project's record names its project. */
  storedAttachment(attachment: PanelAssistantTurnAttachment): AutomationStudioConversationAttachment {
    return panelAssistantAttachmentProjects.stored(attachment);
  }

  /** Closes every open database. */
  close(): Promise<void> {
    return this.pool.closeAll();
  }

  /** Signals that `written`'s thread, in this person's database, changed; called once the write committed. */
  private signalled<TWritten extends { conversationId: string }>(userId: string, written: TWritten): TWritten {
    this.signals?.signal({ kind: "panel", userId }, written.conversationId);
    return written;
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
