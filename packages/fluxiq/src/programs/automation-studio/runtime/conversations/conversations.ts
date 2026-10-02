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
import { automationStudioConversationParkingPort, type AutomationStudioParkingPort } from "../parking/index.ts";
import type { AutomationStudioConversationAnswerKind, AutomationStudioConversationAsk } from "./ask.ts";
import { AutomationStudioProjectConversationStore } from "./store.ts";
import { currentAutomationStudioConversation } from "./context/index.ts";
import {
  automationStudioConversationEffectiveCaller,
  type AutomationStudioConversationEffectiveCaller,
  type AutomationStudioConversationUnlockedSessionResolver
} from "./commands/index.ts";
import type { AutomationStudioConversation, AutomationStudioConversationStatus, AutomationStudioConversationSubject, AutomationStudioConversationThread } from "./thread.ts";
import type { AutomationStudioConversationAttachment, AutomationStudioConversationTurn } from "./turn.ts";
import {
  interpretAutomationStudioConversationTurn,
  respondToAutomationStudioConversationTurn,
  automationStudioConversationModelTranscript,
  type AutomationStudioConversationInstructionAnswer,
  type AutomationStudioConversationInstructionRequest,
  type AutomationStudioConversationModel,
  type AutomationStudioConversationModelTurn,
  type AutomationStudioConversationOnScreen
} from "./instructions/index.ts";
import {
  automationStudioConversationWriter,
  type AutomationStudioConversationAutomationTurnRequest,
  type AutomationStudioConversationOpenRequest,
  type AutomationStudioConversationWriter
} from "./writer.ts";
import { automationStudioConversationWholeThread } from "./whole-thread.ts";

const STORAGE_UNAVAILABLE = "Conversations require project storage.";
/** How far back a thread is searched for asks still waiting. */
const PENDING_ASK_WINDOW = 50;

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

/** A parking port bound to one subject's thread: where a run's questions go and where their answers come back from. */
export type AutomationStudioConversationParkingRequest = {
  projectId: string;
  subject: AutomationStudioConversationSubject;
  /** How often the thread is re-read while a run waits. The default suits a person answering; a test shortens it. */
  pollIntervalMs?: number;
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

  /**
   * Who to wake when an ask is settled in this process. A run waiting on a
   * question is waiting on a row, and polling that row is the only way to see
   * an answer written by another process -- but an answer written by this one
   * is already here, and making the run wait out a poll interval for news it
   * could have had immediately is latency for nothing.
   */
  private readonly askSettledListeners = new Map<string, Set<() => void>>();

  /**
   * The model a person's message is read with, or null. Null is not a dead
   * chat window: the words are matched to the closest capability by Core
   * itself, and the thread says so.
   */
  private model: AutomationStudioConversationModel | null = null;

  /**
   * Where the bound domain's own system instructions are read, when a person's
   * message is read. Asked per message rather than copied once, so a runtime
   * bound after this collaborator was made -- which is how a host binds it --
   * is the one the model is told about.
   */
  private domainInstructions: () => string | undefined = () => undefined;

  /**
   * Finds a person's live unlocked session, so a paired client's chat can use
   * their key (`commands/caller.ts`). Null leaves a paired caller on its own
   * session, where the key is locked.
   */
  private unlockedSession: AutomationStudioConversationUnlockedSessionResolver | null = null;

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
        // Work the chat started speaks in the chat. A build's question is
        // raised on the Flow's subject by code that knows nothing of the chat;
        // inside the thread's ambient context (`context/`) it is the thread the
        // person is typing in that is continued, not a second one about the Flow.
        const ambient = currentAutomationStudioConversation(input.projectId);
        const thread = ambient ? await store.getConversation({ conversationId: ambient.conversationId, limit: 1 }) : null;
        if (thread && thread.conversation.status === "open") return thread.conversation;
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

  /** Connects the lookup of a person's unlocked session, for paired callers. Null disconnects it. */
  bindUnlockedSessionResolver(resolver: AutomationStudioConversationUnlockedSessionResolver | null): this {
    this.unlockedSession = resolver;
    return this;
  }

  /** The session a request's model calls and commands run under: the actor's own, or a paired client's person's unlocked one. */
  callerFor(actor: { userId: string; sessionId: string }): AutomationStudioConversationEffectiveCaller {
    return automationStudioConversationEffectiveCaller(actor, this.unlockedSession);
  }

  /** The thread's asks still waiting for an answer, oldest first, from its most recent turns. */
  pendingAsks(input: { projectId: string; conversationId: string }): Promise<AutomationStudioConversationAsk[]> {
    return this.withStore(input.projectId, async (store) => {
      const turns = await store.recentTurns(input.conversationId, PENDING_ASK_WINDOW);
      return turns.flatMap((turn) => (turn.ask && turn.ask.status === "pending" ? [turn.ask] : []));
    });
  }

  /** One turn by id, or null when the thread does not hold it. */
  getTurn(input: { projectId: string; conversationId: string; turnId: string }): Promise<AutomationStudioConversationTurn | null> {
    return this.withStore(input.projectId, (store) => store.getTurn(input.conversationId, input.turnId));
  }

  /** Connects the model a person's message is read with. Null disconnects it. */
  bindModel(model: AutomationStudioConversationModel | null): this {
    this.model = model;
    return this;
  }

  /**
   * Connects the bound domain's system instructions, already checked where the
   * runtime was bound. The service passes the reader of its own binding
   * (`../service.ts`), so the chat is told what every Flow model call is told.
   */
  bindDomainInstructions(read: () => string | undefined): this {
    this.domainInstructions = read;
    return this;
  }

  /**
   * A person's turn, read as an instruction and answered in the thread.
   *
   * The turn is stored before anything else is tried, so nothing that fails
   * afterwards can lose what the person wrote. The model then reads it with the
   * panel's vocabulary and the end of the thread and decides to run a
   * capability, ask one question, or reply; a model that cannot be used is
   * retried and then stood in for (`instructions/interpret.ts`). The decision is
   * written back as an automation turn. What runs a capability is the panel,
   * from the answer this returns, because the capability's handler is the
   * panel's own code.
   */
  async respondToPersonTurn(input: AutomationStudioConversationInstructionRequest): Promise<AutomationStudioConversationInstructionAnswer> {
    const turn = await this.appendTurn(input);
    const earlier = await this.earlierTurns(input, turn.turnId);
    const onScreen = await this.onScreenWithSubject(input);
    const interpretation = await interpretAutomationStudioConversationTurn({
      model: this.model,
      message: input.text,
      transcript: earlier.transcript,
      transcriptWithheld: earlier.withheld,
      context: { projectId: input.projectId, capabilities: input.capabilities, flows: input.flows, onScreen, message: input.text },
      domainInstructions: this.domainInstructions(),
      caller: input.caller ?? null,
      ...(input.limits ? { limits: input.limits } : {})
    });
    try {
      const written = await respondToAutomationStudioConversationTurn({ host: this, projectId: input.projectId, conversationId: input.conversationId, interpretation, flows: input.flows });
      return { turn, response: { ...interpretation, ...written }, problem: null };
    } catch (error) {
      // The person's turn is stored and the decision was made; only writing
      // the answer failed. Say so rather than failing the whole request, which
      // would read as the message itself being lost and invite a duplicate.
      return { turn, response: null, problem: `Your message was saved, but my answer could not be written into the thread: ${error instanceof Error ? error.message : String(error)}` };
    }
  }

  /**
   * What is on screen, with the thread's own Flow standing in when none is
   * open. A chat about one automation -- opened from its row in the extension's
   * list -- is about that Flow, so "run it" there means it, not a question
   * back. A subject that cannot be read leaves what was sent as it was.
   */
  private async onScreenWithSubject(input: AutomationStudioConversationInstructionRequest): Promise<AutomationStudioConversationOnScreen> {
    if (input.onScreen.flowId) return input.onScreen;
    let thread: AutomationStudioConversationThread | null;
    try {
      thread = await this.withStore(input.projectId, (store) => store.getConversation({ conversationId: input.conversationId, limit: 1 }));
    } catch (error) {
      // Context, not the message: the turn is still read, without the subject.
      if (error instanceof Error) return input.onScreen;
      throw error;
    }
    const subject = thread?.conversation.subject;
    return subject?.kind === "flow" ? { ...input.onScreen, flowId: subject.id } : input.onScreen;
  }

  /** The thread before `turnId`, every turn of it, as the model reads it, or a note that it could not be read. */
  private async earlierTurns(input: { projectId: string; conversationId: string }, turnId: string): Promise<{ transcript: AutomationStudioConversationModelTurn[]; withheld: boolean }> {
    try {
      // The whole thread (2026-09-30): it was the last 20 turns.
      const turns = await this.withStore(input.projectId, (store) => automationStudioConversationWholeThread((page) => store.getConversation(page), input.conversationId));
      const transcript = automationStudioConversationModelTranscript(turns, turnId);
      return { transcript, withheld: false };
    } catch (error) {
      // The earlier thread is context, not the message. The model is told it
      // is missing (`withheld`), and the message is still read and answered.
      return { transcript: [], withheld: error !== undefined };
    }
  }

  /** Settles one ask. An ask is answered once; a second, different answer is refused. */
  answerAsk(input: AutomationStudioConversationAnswerRequest): Promise<AutomationStudioConversationAsk> {
    return this.settling(this.withStore(input.projectId, (store) =>
      store.answerAsk({
        mutationId: input.mutationId ?? answerMutationId(input),
        askId: input.askId,
        kind: input.kind,
        value: input.value ?? null,
        actorId: input.actorId ?? null
      })
    ));
  }

  /**
   * Closes an ask nobody answered in time, or hands back the answer that beat
   * the deadline. Expiry never refuses: the clock is not a person, and losing
   * the race to a real answer is the outcome that should win.
   */
  expireAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk> {
    return this.settling(this.withStore(input.projectId, (store) => store.expireAsk({ mutationId: `conversation.expire:${input.askId}`, askId: input.askId })));
  }

  /** Tells the caller the moment an ask is settled in this process. Returns the way to stop listening. */
  onAskSettled(askId: string, listener: () => void): () => void {
    const listeners = this.askSettledListeners.get(askId) ?? new Set<() => void>();
    listeners.add(listener);
    this.askSettledListeners.set(askId, listeners);
    return () => {
      const current = this.askSettledListeners.get(askId);
      if (!current) return;
      current.delete(listener);
      if (!current.size) this.askSettledListeners.delete(askId);
    };
  }

  /**
   * The thread as a parking port: `open` posts the question as a turn, and
   * `awaitAnswer` holds the run in place until the person answers it, the ask
   * runs out of time, or the run is cancelled.
   */
  parkingPort(input: AutomationStudioConversationParkingRequest): AutomationStudioParkingPort {
    return automationStudioConversationParkingPort({
      host: this,
      projectId: input.projectId,
      subject: input.subject,
      ...(input.pollIntervalMs === undefined ? {} : { pollIntervalMs: input.pollIntervalMs })
    });
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

  /** Wakes whoever is waiting on an ask once it is no longer pending, and answers with the ask either way. */
  private async settling(write: Promise<AutomationStudioConversationAsk>): Promise<AutomationStudioConversationAsk> {
    const ask = await write;
    if (ask.status !== "pending") for (const listener of [...(this.askSettledListeners.get(ask.askId) ?? [])]) listener();
    return ask;
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
