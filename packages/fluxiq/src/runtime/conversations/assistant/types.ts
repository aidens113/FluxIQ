// The panel assistant's shared nouns: the page and selection a message was sent
// from, the model it talks to, the program API it acts through, and the records
// its endpoints answer with.
//
// Types only. The assistant answers `panel` threads; a project's own threads keep
// `../instructions/` and nothing here touches them.
//
// **The program API is a port.** The framework never imports a program
// (`scripts/structure-audit/config.mjs`, user 2026-11-02), so the registry and
// the tool catalog reach the assistant as `PanelAssistantPrograms`, which the
// Studio handlers build from `GlobalProgramApiRegistry` and
// `AssistantToolCatalog` (`programs/automation-studio/api/handlers/panel-assistant/`).

import type { AssistantConsequence, AssistantToolEntry, PanelContextKey } from "@fluxiq/contracts/program-api-inputs";
import type { JsonObject } from "../../../core/index.ts";
import type { AutomationStudioConversation, AutomationStudioConversationThread } from "../thread.ts";

/**
 * What is on the panel when a message is sent: the page, in the client's own
 * word (`flows`, `runs`), and what is selected there. Every field is optional;
 * a client sends what it knows and Core never invents the rest.
 */
export type PanelAssistantContext = {
  page?: string;
  projectId?: string;
  flowId?: string;
  stepNumbers?: readonly number[];
  nodeIds?: readonly string[];
  runId?: string;
  datasetId?: string;
  keyId?: string;
  folder?: string;
};

/** Who is talking: the person's user and the panel session they sent from. The program side's actor carries more; the assistant reads only these. */
export type PanelAssistantActor = { userId: string; sessionId: string };

/** The domain scope a request came in under, handed on to every call it makes. */
export type PanelAssistantScope = { domainId?: string | null };

/** A panel thread as the endpoints answer it: subject `panel`, about no one project. */
export type PanelAssistantConversation = Omit<AutomationStudioConversation, "subject"> & { subject: { kind: "panel"; id: string } };

/** A panel thread and the turns a reader asked for. */
export type PanelAssistantThread = Omit<AutomationStudioConversationThread, "conversation"> & { conversation: PanelAssistantConversation };

/** A navigation the dock runs itself: open a page, or select something on it. */
export type PanelAssistantClientAction = { tool: "panel.open" | "panel.select"; input: JsonObject };

/** One entry of what the model reads: the person, the assistant's own decisions, and what a tool answered. */
export type PanelAssistantModelTurn = { author: "person" | "assistant" | "tool"; text: string };

/** One request to the model: its instructions and everything said so far, oldest first. */
export type PanelAssistantModelRequest = { instructions: string; transcript: readonly PanelAssistantModelTurn[] };

/** Who the call is for, so a key that is the person's own is released to their session, and the call's signal. */
export type PanelAssistantModelExecution = { signal: AbortSignal; caller: PanelAssistantActor };

/** What one model call answered (a string or an object; `./loop/decision.ts` reads either) and what it cost in US dollars. */
export type PanelAssistantModelReply = { decision: unknown; costUsd: number };

/** The model the assistant asks, one decision per call. Throws on failure; an error whose `retryable` is not `true` ends the message. */
export type PanelAssistantModel = {
  readonly name: string;
  decide(request: PanelAssistantModelRequest, execution: PanelAssistantModelExecution): Promise<PanelAssistantModelReply>;
};

/** The model for this person now, or the plain reason there is none (no key yet, a locked key). */
export type PanelAssistantModelChoice = { ok: true; model: PanelAssistantModel } | { ok: false; reason: string };

/** Where the assistant gets its model for a message: the key Settings chose (`./model/`), or a script in tests and on the e2e fixture host. */
export type PanelAssistantModelSource = (caller: PanelAssistantActor) => Promise<PanelAssistantModelChoice>;

/**
 * The person's spending allowance per message, in US dollars, stored beside the
 * assistant's model choice (Secret Keys' model settings). Undefined: none was
 * chosen, and `PANEL_ASSISTANT_DEFAULT_ALLOWANCE_USD` applies.
 */
export type PanelAssistantSettings = {
  allowanceUsd(): Promise<number | undefined>;
  setAllowanceUsd(usd: number | undefined): Promise<number | undefined>;
};

/** One thing a call acts on, in a person's words: its kind ("Flow"), its id, its name when it has one, and the selection key that names it. */
export type PanelAssistantTargetItem = { kind: string; id: string; name?: string; contextKey?: PanelContextKey };

/**
 * Everything one call would act on, and a sentence more about it when the
 * lookup knows one ("It removes the Flow and its 12 runs."). `partial`: the
 * call's input also names something `items` does not list, so it may act on
 * more; the card still names `items`, but no words can clearly ask for it.
 */
export type PanelAssistantTarget = { items: readonly PanelAssistantTargetItem[]; detail?: string; partial?: true };

/** One call the model chose: the catalog tool and its input, with what the page fills already filled. */
export type PanelAssistantToolCall = { tool: AssistantToolEntry; input: JsonObject };

/** What a program call answered, as the registry answers it. */
export type PanelAssistantCallResult = { ok: boolean; payload?: unknown; error?: string; errorCode?: string };

/**
 * The program API as the assistant uses it. Every call goes through the
 * registry as the person's own actor with `via: "assistant"`, so the assistant
 * can do exactly what the person can and IAM decides each call.
 */
export type PanelAssistantPrograms<TActor extends PanelAssistantActor = PanelAssistantActor> = {
  /** Every tool the registry declares for the assistant, by name. */
  tools(): readonly AssistantToolEntry[];
  /** The tools matching words, best first, with no model involved. */
  find(query: string, among?: readonly AssistantToolEntry[]): AssistantToolEntry[];
  /** The classes this call has: its tool's own, or for a `per-call` run its Flow's (unknown: it may send, pay and delete). */
  consequencesOf(call: PanelAssistantToolCall, actor: TActor): Promise<readonly AssistantConsequence[]>;
  /** What the call would act on, or undefined when that cannot be said; then the person's words can never clearly ask for it. */
  describeTarget(call: PanelAssistantToolCall, actor: TActor): Promise<PanelAssistantTarget | undefined>;
  /** What the call commits to spend in US dollars beyond what was already given (budget it adds), as its endpoint declares it (`spends`), or undefined when it declares none. Over what is left of the message's allowance, it is gated as `budget`; once it runs, it counts against that allowance. */
  projectedCostUsd(call: PanelAssistantToolCall, actor: TActor): Promise<number | undefined>;
  /** The names of what the panel has selected, for the context line. */
  selectionNames(context: PanelAssistantContext, actor: TActor): Promise<{ project?: string; flow?: string }>;
  /** Whether the call needs a person's press to run (a destructive endpoint). */
  needsPress(call: PanelAssistantToolCall): boolean;
  /** Runs the call through the registry as `actor`, `via: "assistant"`, with a grant only server code minted. */
  call(call: PanelAssistantToolCall, actor: TActor, options: { scope: PanelAssistantScope; pressGrant?: string }): Promise<PanelAssistantCallResult>;
  /** Mints a press grant for exactly this call, for the person's own request (never `via`), earned as `consent` says; the audit records which. */
  mintPress(call: PanelAssistantToolCall, actor: TActor, scope: PanelAssistantScope, consent: PanelAssistantConsent): Promise<{ ok: true; grant: string } | { ok: false; error: string }>;
};

/** How the person asked for a call that needs their press: `press`, they pressed Allow on its card; `words`, their own message clearly asked for it. */
export type PanelAssistantConsent = "press" | "words";
