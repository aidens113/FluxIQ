// Conversations for the Automation Studio service.
//
// Reached through the service's `conversations` field, the way run datasets
// are, so the frozen facade gains no members. Every call opens the project's
// conversation store and closes it before returning; nothing is held between
// calls, because a thread that is only read when someone asks needs no
// residency and a parked run is waiting on a row, not on a process.
//
// Ids are minted here rather than by callers. A turn a run posts and a turn a
// person posts are the same kind of thing and must not be told apart by the
// shape of their ids, and the mutation id each write runs under is derived
// from the row's own id, so a retried write replays instead of duplicating.

import { createHash, randomUUID } from "node:crypto";
import type { AutomationStudioProjectDatabasePool } from "../../storage/index.ts";
import type { AutomationStudioConversationAnswerKind, AutomationStudioConversationAsk } from "./ask.ts";
import { AutomationStudioProjectConversationStore } from "./store.ts";
import type { AutomationStudioConversation, AutomationStudioConversationStatus, AutomationStudioConversationSubject, AutomationStudioConversationThread } from "./thread.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationTurn } from "./turn.ts";
import {
  automationStudioConversationWriter,
  type AutomationStudioConversationAutomationTurnRequest,
  type AutomationStudioConversationOpenRequest,
  type AutomationStudioConversationWriter
} from "./writer.ts";

const STORAGE_UNAVAILABLE = "Conversations require project storage.";

export type AutomationStudioConversationListRequest = {
  projectId: string;
  subject?: AutomationStudioConversationSubject | undefined;
  status?: AutomationStudioConversationStatus | undefined;
  limit?: unknown;
};

export type AutomationStudioConversationReadRequest = {
  projectId: string;
  conversationId: string;
  sinceTurnId?: string | undefined;
  limit?: unknown;
};

/** A person's own turn, written through the API. */
export type AutomationStudioConversationPersonTurnRequest = {
  projectId: string;
  conversationId: string;
  text: string;
  actorId?: string | undefined;
  attachment?: AutomationStudioConversationAttachment | undefined;
};

export type AutomationStudioConversationAnswerRequest = {
  projectId: string;
  askId: string;
  kind: AutomationStudioConversationAnswerKind;
  value?: string | undefined;
  actorId?: string | undefined;
  /** Supply one to force a distinct write; the default replays an exact resend and lets anything else reach the store's refusal. */
  mutationId?: string | undefined;
};

/**
 * What a turn's attachment actually is, when something can serve it. The thread
 * stores a `kind` and a `ref` and renders nothing, so resolving the reference
 * into a payload belongs to whatever owns the thing referred to -- a dataset
 * page, a stored object, a run's detail. Core wires one of these in; without
 * one, asking for an attachment's payload says so rather than answering with
 * nothing.
 */
export type AutomationStudioConversationAttachmentResolver = (input: {
  projectId: string;
  conversationId: string;
  turnId: string;
  attachment: AutomationStudioConversationAttachment;
}) => Promise<unknown>;

export type AutomationStudioConversationAttachmentRequest = {
  projectId: string;
  conversationId: string;
  turnId: string;
};

/** A turn's attachment and, when a resolver is configured, what it refers to. */
export type AutomationStudioConversationAttachmentAnswer = {
  attachment: AutomationStudioConversationAttachment;
  payload: unknown;
};

export type AutomationStudioConversationWriterRequest = {
  projectId: string;
  subject: AutomationStudioConversationSubject;
  title?: string | null;
  conversationId?: string;
};

export class AutomationStudioConversations {
  /** False without a project database pool. Every method then throws, because there is nowhere for a thread to live. */
  readonly available: boolean;

  constructor(
    private readonly pool: AutomationStudioProjectDatabasePool | undefined,
    private readonly resolveAttachment?: AutomationStudioConversationAttachmentResolver
  ) {
    this.available = pool !== undefined;
  }

  /** The project's threads, most recently touched first. */
  listConversations(input: AutomationStudioConversationListRequest): Promise<AutomationStudioConversation[]> {
    return this.withStore(input.projectId, (store) =>
      store.listConversations({
        ...(input.subject === undefined ? {} : { subjectKind: input.subject.kind, subjectId: input.subject.id }),
        ...(input.status === undefined ? {} : { status: input.status }),
        limit: input.limit
      })
    );
  }

  /** One thread, with everything after `sinceTurnId` when a reader already holds part of it. */
  getConversation(input: AutomationStudioConversationReadRequest): Promise<AutomationStudioConversationThread | null> {
    return this.withStore(input.projectId, (store) =>
      store.getConversation({
        conversationId: input.conversationId,
        ...(input.sinceTurnId === undefined ? {} : { sinceTurnId: input.sinceTurnId }),
        limit: input.limit
      })
    );
  }

  /** One ask by id, or null when the project holds no such ask. */
  getAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk | null> {
    return this.withStore(input.projectId, (store) => store.getAsk(input.askId));
  }

  /**
   * A turn's attachment, with what it refers to when a resolver is configured.
   * Null when the thread holds no such turn, or the turn shows nothing.
   * Throws, rather than answering an empty payload, when nothing here can
   * serve the reference: a reader must be able to tell "shows nothing" from
   * "shows something this deployment cannot fetch".
   */
  async getAttachment(input: AutomationStudioConversationAttachmentRequest): Promise<AutomationStudioConversationAttachmentAnswer | null> {
    const turn = await this.withStore(input.projectId, (store) => store.getTurn(input.conversationId, input.turnId));
    if (!turn || !turn.attachment) return null;
    if (!this.resolveAttachment) throw new Error(`This deployment cannot serve a conversation attachment of kind ${turn.attachment.kind}.`);
    const attachment = turn.attachment;
    return { attachment, payload: await this.resolveAttachment({ projectId: input.projectId, conversationId: input.conversationId, turnId: input.turnId, attachment }) };
  }

  /**
   * The subject's thread: the one `conversationId` names, or the subject's own
   * open thread, or a new one.
   *
   * Resolving the subject to a thread is the point. A run raises a permission
   * ask from the gate and posts a progress turn from the executor, and those
   * are two call sites with no id between them; without this each would open a
   * thread of its own and the person would be shown one run as three
   * conversations. So an open thread for the subject is continued rather than
   * duplicated, and a resolved one is left resolved -- the next thing said
   * about that subject starts a new thread.
   */
  openConversation(input: AutomationStudioConversationOpenRequest): Promise<AutomationStudioConversation> {
    return this.withStore(input.projectId, async (store) => {
      if (input.conversationId === undefined) {
        const [open] = await store.listConversations({ subjectKind: input.subject.kind, subjectId: input.subject.id, status: "open", limit: 1 });
        if (open) return open;
      }
      const conversationId = input.conversationId ?? `conversation.${randomUUID()}`;
      return store.openConversation({
        mutationId: `conversation.open:${conversationId}`,
        conversationId,
        subjectKind: input.subject.kind,
        subjectId: input.subject.id,
        title: input.title
      });
    });
  }

  /** A turn Core itself writes: what a run, a build or a node says, and the ask it raises. */
  appendAutomationTurn(input: AutomationStudioConversationAutomationTurnRequest): Promise<AutomationStudioConversationTurn> {
    const turnId = `turn.${randomUUID()}`;
    return this.withStore(input.projectId, (store) =>
      store.appendTurn({
        mutationId: `conversation.turn:${turnId}`,
        conversationId: input.conversationId,
        turnId,
        author: "automation",
        text: input.text,
        ask: input.ask,
        attachment: input.attachment
      })
    );
  }

  /** A turn the person writes, through the API. */
  appendTurn(input: AutomationStudioConversationPersonTurnRequest): Promise<AutomationStudioConversationTurn> {
    const turnId = `turn.${randomUUID()}`;
    return this.withStore(input.projectId, (store) =>
      store.appendTurn({
        mutationId: `conversation.turn:${turnId}`,
        conversationId: input.conversationId,
        turnId,
        author: "person",
        text: input.text,
        actorId: input.actorId ?? null,
        attachment: input.attachment ?? null
      })
    );
  }

  /** Settles one ask. An ask is answered once; a second, different answer is refused. */
  answerAsk(input: AutomationStudioConversationAnswerRequest): Promise<AutomationStudioConversationAsk> {
    return this.withStore(input.projectId, (store) =>
      store.answerAsk({
        mutationId: input.mutationId ?? answerMutationId(input),
        askId: input.askId,
        kind: input.kind,
        value: input.value ?? null,
        actorId: input.actorId ?? null
      })
    );
  }

  /** A writer bound to one subject, for the code that has something to say rather than a thread to manage. */
  writerFor(input: AutomationStudioConversationWriterRequest): AutomationStudioConversationWriter {
    return automationStudioConversationWriter({
      host: this,
      projectId: input.projectId,
      subject: input.subject,
      ...(input.title === undefined ? {} : { title: input.title }),
      ...(input.conversationId === undefined ? {} : { conversationId: input.conversationId })
    });
  }

  private async withStore<TResult>(projectId: string, operation: (store: AutomationStudioProjectConversationStore) => Promise<TResult>): Promise<TResult> {
    if (!this.pool) throw new Error(STORAGE_UNAVAILABLE);
    const store = await AutomationStudioProjectConversationStore.open({ pool: this.pool, projectId });
    try {
      return await operation(store);
    } finally {
      await store.close();
    }
  }
}

/**
 * The mutation one answer runs under, derived from the answer itself rather
 * than from the ask alone. An exact resend -- a retried request, a double
 * click -- lands on the same mutation and replays the first write. A second
 * answer that says anything different lands on a new one, reaches the store,
 * and is refused there with the sentence a person can read, instead of a
 * mutation-digest mismatch nobody outside the storage layer can interpret.
 */
function answerMutationId(input: { askId: string; kind: AutomationStudioConversationAnswerKind; value?: string | undefined }): string {
  const digest = createHash("sha256").update(JSON.stringify([input.askId, input.kind, input.value ?? null])).digest("hex").slice(0, 32);
  return `conversation.answer:${digest}`;
}
