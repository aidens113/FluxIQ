// The panel-wide assistant: one chat docked on every page, able to do what the
// person can through the program API, powered by the key they chose (U5, U7).
//
// It answers `panel` threads only, kept per person outside every project
// (`./store/`). A message is stored, then worked on in the background, one
// message at a time per thread, and every step lands in the thread as it
// happens, which the dock reads as it reads any thread. Long work a tool starts
// (a run, a build) is followed in the activity feed, not waited on.
//
// The model, the settings and the program API are bound by the host
// (`programs/automation-studio/api/handlers/panel-assistant/`), so tests and
// the e2e fixture host can script the model.

import type { AutomationStudioConversationAsk } from "../ask.ts";
import type { AutomationStudioConversationAttachmentAnswer } from "../conversations.ts";
import { automationStudioConversationIdOrRefuse, automationStudioConversationTitleOrRefuse } from "../inputs.ts";
import type { AutomationStudioConversationTurn } from "../turn.ts";
import { PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD, panelAssistantAllowanceOrRefuse } from "./allowance.ts";
import { panelAssistantAttachmentPayload, panelAssistantAttachmentProjects, type PanelAssistantProjectAttachments } from "./attachments/index.ts";
import { panelAssistantContextOf } from "./context/index.ts";
import {
  PANEL_ASSISTANT_WORDS,
  PanelAssistantPurse,
  panelAssistantLoopWatch,
  panelAssistantRunProgramCall,
  panelAssistantStepText,
  panelAssistantStepTitle,
  runPanelAssistantTurn,
  type PanelAssistantTurnOutcome,
  type PanelAssistantTurnState
} from "./loop/index.ts";
import type { PanelAssistantThreads } from "./store/index.ts";
import { PanelAssistantThreadUse } from "./thread-use.ts";
import type { PanelAssistantActor, PanelAssistantContext, PanelAssistantConversation, PanelAssistantModelSource, PanelAssistantPrograms, PanelAssistantScope, PanelAssistantSettings, PanelAssistantThread } from "./types.ts";

/** The longest a new thread's title is, taken from the first message. */
const TITLE_LENGTH = 80;

/** What a send answers at once: the thread, the person's stored turn, and the work, which goes on after the answer. */
export type PanelAssistantSent = { conversation: PanelAssistantConversation; turn: AutomationStudioConversationTurn; working: Promise<PanelAssistantTurnOutcome> };

/** What an answer to a card answers at once: the settled ask, and the work it started. */
export type PanelAssistantAnswered = { ask: AutomationStudioConversationAsk; working: Promise<PanelAssistantTurnOutcome> };

export class PanelAssistant<TActor extends PanelAssistantActor = PanelAssistantActor> {
  private readonly threadsOf: () => PanelAssistantThreads;
  private readonly programs: PanelAssistantPrograms<TActor>;
  private modelSource: PanelAssistantModelSource | null = null;
  private settings: PanelAssistantSettings | null = null;
  private readonly queues = new Map<string, Promise<unknown>>();
  private readonly use = new PanelAssistantThreadUse();
  private readonly stopping = new AbortController();

  /** `threads` is read on first use, so registering the endpoints touches nothing. */
  constructor(options: { threads: () => PanelAssistantThreads; programs: PanelAssistantPrograms<TActor> }) {
    this.threadsOf = options.threads;
    this.programs = options.programs;
  }

  /** The model each message asks. Null unbinds it; a message then says the assistant has no model. */
  bindModelSource(source: PanelAssistantModelSource | null): this {
    this.modelSource = source;
    return this;
  }

  /** Where the spending allowance is kept. Unbound, the default applies and cannot be changed. */
  bindSettings(settings: PanelAssistantSettings | null): this {
    this.settings = settings;
    return this;
  }

  openThread(actor: TActor, input: { title?: string | null } = {}): Promise<PanelAssistantConversation> {
    return this.threadsOf().open(actor.userId, { title: input.title ?? null });
  }

  listThreads(actor: TActor, input: { limit?: unknown } = {}): Promise<PanelAssistantConversation[]> {
    return this.threadsOf().list(actor.userId, input);
  }

  readThread(actor: TActor, input: { conversationId: string; sinceTurnId?: string; limit?: unknown }): Promise<PanelAssistantThread | null> {
    return this.threadsOf().read(actor.userId, input);
  }

  /** The allowance a message has now, and whether the person chose it. */
  async allowance(): Promise<{ allowanceUsd: number; chosen: boolean; defaultUsd: number }> {
    const chosen = await this.settings?.allowanceUsd();
    return { allowanceUsd: chosen ?? PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD, chosen: chosen !== undefined, defaultUsd: PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD };
  }

  /** Sets the allowance (undefined: back to the default). */
  async setAllowance(value: unknown): Promise<{ allowanceUsd: number; chosen: boolean; defaultUsd: number }> {
    if (!this.settings) throw new Error("The assistant's settings are not available on this panel.");
    await this.settings.setAllowanceUsd(value === undefined || value === null ? undefined : panelAssistantAllowanceOrRefuse(value));
    return this.allowance();
  }

  /**
   * Stores the person's message in a thread (a new one without
   * `conversationId`) and starts the work on it. The person's page and
   * selection come from `onScreen` (`ChatSend.onScreen`).
   */
  async send(actor: TActor, scope: PanelAssistantScope, input: { conversationId?: string; text: string; onScreen?: unknown; title?: string | null }): Promise<PanelAssistantSent> {
    const threads = this.threadsOf();
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (!text) throw new Error("Write a message first.");
    // Held before anything is awaited, so the thread cannot be removed between this read and the work (`./thread-use.ts`).
    let release = input.conversationId === undefined ? undefined : this.use.hold(this.key(actor, automationStudioConversationIdOrRefuse(input.conversationId, "conversation")));
    try {
      let conversation: PanelAssistantConversation;
      if (input.conversationId === undefined) {
        conversation = await threads.open(actor.userId, { title: input.title ?? text.split("\n")[0]!.slice(0, TITLE_LENGTH) });
        release = this.use.hold(this.key(actor, conversation.conversationId));
      } else {
        const thread = await threads.read(actor.userId, { conversationId: input.conversationId, limit: 1 });
        if (!thread) throw new Error("That conversation does not exist.");
        conversation = thread.conversation;
      }
      const turn = await threads.append(actor.userId, { conversationId: conversation.conversationId, author: "person", text, actorId: actor.userId });
      const context = panelAssistantContextOf(input.onScreen);
      const working = this.queued(actor, conversation.conversationId, () => this.work(actor, scope, conversation.conversationId, text, context), release);
      return { conversation, turn, working };
    } catch (error) {
      release?.();
      throw error;
    }
  }

  /**
   * The person's answer to a card. Allow runs exactly the call the card was
   * about, once, with a press grant minted for it now, and the work goes on
   * from its answer; Don't runs nothing. An ask that is not a card is settled
   * and nothing runs.
   *
   * The work Allow goes on with is judged by the words and the page of the
   * message the card was raised under, kept with its call: never the page the
   * press came from, nor a message sent since. Otherwise "delete this", said
   * with one Flow selected, would delete whatever was selected at the press
   * (review P9-R2).
   */
  async answer(actor: TActor, scope: PanelAssistantScope, input: { askId: string; kind: "grant" | "deny" }): Promise<PanelAssistantAnswered> {
    const threads = this.threadsOf();
    const pending = await threads.getAsk(actor.userId, input.askId);
    if (!pending) throw new Error("That question does not exist.");
    // Held from here to the end of the work it starts, so the thread cannot be removed under it.
    const release = this.use.hold(this.key(actor, pending.conversationId));
    try {
      // The same answer again (a double click, a retried request) replays the first and starts nothing; a different one is refused by the store.
      const ask = await threads.answer(actor.userId, { askId: input.askId, kind: input.kind, actorId: actor.userId });
      if (pending.status !== "pending") {
        release();
        return { ask, working: Promise.resolve<PanelAssistantTurnOutcome>({ ending: "replied", spentUsd: 0, clientActions: [] }) };
      }
      return { ask, working: this.queued(actor, ask.conversationId, () => this.answered(actor, scope, ask, input.kind), release) };
    } catch (error) {
      release();
      throw error;
    }
  }

  /** Gives one of the person's threads their own name. The name is checked before the thread is looked for. */
  renameThread(actor: TActor, input: { conversationId: string; title: unknown }): Promise<PanelAssistantConversation> {
    const title = automationStudioConversationTitleOrRefuse(input.title);
    return this.threadsOf().rename(actor.userId, { conversationId: input.conversationId, title });
  }

  /**
   * Removes one of the person's threads with everything said and asked in it.
   * Refused with `conversation_run_active` while a message's or a card's work
   * still uses it (`./thread-use.ts`); a thread they do not have is
   * `conversation_not_found`, whoever else may hold one under that id.
   */
  deleteThread(actor: TActor, input: { conversationId: string }): Promise<{ deleted: true; conversationId: string }> {
    const conversationId = automationStudioConversationIdOrRefuse(input.conversationId, "conversation");
    return this.use.remove(this.key(actor, conversationId), () => this.threadsOf().delete(actor.userId, { conversationId }));
  }

  /**
   * A turn's attachment and what it refers to, or null when the person's
   * threads hold no such turn or it shows nothing: a thread someone else holds
   * reads exactly as one that does not exist. A project-bound attachment is
   * read through `inProject` in the project its reference names; `projectId`,
   * the request's project, is used only for a reference that names none
   * (`./attachments/`).
   */
  async readAttachment(actor: TActor, input: { conversationId: string; turnId: string; projectId: string | null }, inProject: PanelAssistantProjectAttachments): Promise<AutomationStudioConversationAttachmentAnswer | null> {
    const turn = await this.threadsOf().turn(actor.userId, input);
    if (!turn?.attachment) return null;
    const attachment = turn.attachment;
    return { attachment, payload: await panelAssistantAttachmentPayload({ projectId: input.projectId, conversationId: turn.conversationId, turnId: turn.turnId, attachment }, inProject) };
  }

  /** Resolves once every message's work in flight has ended. */
  async idle(): Promise<void> {
    while (this.queues.size) await Promise.allSettled([...this.queues.values()]);
  }

  /** Stops the work in flight at its next step, waits for it, and closes the databases. */
  async close(): Promise<void> {
    this.stopping.abort();
    await this.idle();
    await this.threadsOf().close();
  }

  private async answered(actor: TActor, scope: PanelAssistantScope, ask: AutomationStudioConversationAsk, kind: "grant" | "deny"): Promise<PanelAssistantTurnOutcome> {
    const threads = this.threadsOf();
    // Taken either way, so a card answered Don't can never be run by a later press.
    const call = await threads.takeWaitingCall(actor.userId, ask.askId);
    const state = await this.state(actor, scope, ask.conversationId, call?.context ?? {}, call?.words ?? "");
    if (kind === "deny") {
      if (call) await state.post(PANEL_ASSISTANT_WORDS.declined);
      return { ending: "replied", spentUsd: 0, clientActions: [] };
    }
    const tool = call ? this.programs.tools().find((candidate) => candidate.name === call.toolName) : undefined;
    if (!call || !tool) {
      await state.post(PANEL_ASSISTANT_WORDS.cardGone);
      return { ending: "replied", spentUsd: 0, clientActions: [] };
    }
    const allowed = { tool, input: call.input };
    const result = await panelAssistantRunProgramCall(state, allowed, "press");
    const committed = result.ok ? await this.programs.projectedCostUsd(allowed, actor) : undefined;
    if (committed !== undefined) state.purse.paid(committed);
    await state.post(panelAssistantStepText({ title: panelAssistantStepTitle(tool), why: PANEL_ASSISTANT_WORDS.allowed, outcome: result.ok ? PANEL_ASSISTANT_WORDS.done : PANEL_ASSISTANT_WORDS.notDone(result.error ?? "the program gave no reason") }));
    // The work goes on from what the allowed call answered, on the words and page the card was raised under.
    state.entries.push({ author: "tool", text: JSON.stringify(result.ok ? { tool: tool.name, ok: true, allowedByPerson: true, answer: result.payload ?? null } : { tool: tool.name, ok: false, allowedByPerson: true, error: result.error ?? null }) });
    return this.continueWith(state);
  }

  private async work(actor: TActor, scope: PanelAssistantScope, conversationId: string, words: string, context: PanelAssistantContext): Promise<PanelAssistantTurnOutcome> {
    return this.continueWith(await this.state(actor, scope, conversationId, context, words));
  }

  private async continueWith(state: PanelAssistantTurnState<TActor>): Promise<PanelAssistantTurnOutcome> {
    const choice = this.modelSource ? await this.modelSource({ userId: state.actor.userId, sessionId: state.actor.sessionId }) : { ok: false as const, reason: "The assistant has no model on this panel yet. Add a model key in Settings." };
    if (!choice.ok) {
      await state.post(choice.reason);
      return { ending: "no_model", spentUsd: 0, clientActions: [] };
    }
    return runPanelAssistantTurn(state, { model: choice.model, signal: this.stopping.signal });
  }

  private async state(actor: TActor, scope: PanelAssistantScope, conversationId: string, context: PanelAssistantContext, words: string): Promise<PanelAssistantTurnState<TActor>> {
    const threads = this.threadsOf();
    const { allowanceUsd } = await this.allowance();
    return {
      programs: this.programs,
      threads,
      actor,
      scope,
      conversationId,
      words,
      context,
      purse: new PanelAssistantPurse(allowanceUsd),
      watch: panelAssistantLoopWatch(conversationId),
      entries: [],
      clientActions: [],
      post: async (text, attachment) => {
        await threads.append(actor.userId, { conversationId, author: "automation", text, attachment: attachment ? panelAssistantAttachmentProjects.stored(attachment) : null });
      }
    };
  }

  /** One person's one thread, for the work queue and the holds on it. */
  private key(actor: TActor, conversationId: string): string {
    return `${actor.userId}\u0000${conversationId}`;
  }

  /**
   * Runs `work` after the thread's earlier work, and never rejects: a failure
   * is said in the thread in plain words, so a message never ends in silence.
   * `release` lets the thread go once the work has ended (`./thread-use.ts`).
   */
  private queued(actor: TActor, conversationId: string, work: () => Promise<PanelAssistantTurnOutcome>, release: (() => void) | undefined): Promise<PanelAssistantTurnOutcome> {
    const key = this.key(actor, conversationId);
    const before = this.queues.get(key) ?? Promise.resolve();
    const run = before.then(work, work).catch(async (error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`The panel assistant's work on a message failed (${error instanceof Error ? error.name : "non_error"}).`);
      try {
        await this.threadsOf().append(actor.userId, { conversationId, author: "automation", text: `Something went wrong while I worked on that: ${message}` });
      } catch (reportError) {
        console.warn(`The panel assistant could not say so in the thread (${reportError instanceof Error ? reportError.name : "non_error"}).`);
      }
      return { ending: "failed" as const, spentUsd: 0, clientActions: [] };
    });
    this.queues.set(key, run);
    void run.then(() => {
      if (this.queues.get(key) === run) this.queues.delete(key);
      release?.();
    });
    return run;
  }
}

