// What a conversation command is, what it runs against, and what it answers.
//
// Types only. A command is a capability the chat can choose that Core runs
// itself, server-side, for any client: the web panel, a paired extension, a
// script. It reaches the rest of Core only through a port that calls the
// program registry with the caller's own actor and scope, so every endpoint's
// permission and handler checks apply to it exactly as they apply to a button.

import type { AutomationStudioActionConsequence } from "../../action-permissions/index.ts";
import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import type { AutomationStudioConversationAsk } from "../ask.ts";
import type { AutomationStudioConversationTurn } from "../turn.ts";
import type { AutomationStudioConversationAutomationTurnRequest } from "../writer.ts";

/** What one registry call came back with, in the registry's own shape. */
export type AutomationStudioConversationCommandCallResult = {
  ok: boolean;
  payload?: unknown;
  error?: string;
};

/**
 * How a command reaches Core: one registry endpoint and its payload. The
 * binding (`port.ts`) supplies the caller's actor and scope and refuses any
 * endpoint that deletes or pays, so a command cannot do what the person could
 * not have done by pressing the control.
 */
export type AutomationStudioConversationCommandPort = {
  call(endpoint: string, payload: Record<string, unknown>): Promise<AutomationStudioConversationCommandCallResult>;
};

/** What a command needs from the thread: to say something, and to find the ask it answers. */
export type AutomationStudioConversationCommandHost = {
  appendAutomationTurn(input: AutomationStudioConversationAutomationTurnRequest): Promise<AutomationStudioConversationTurn>;
  pendingAsks(input: { projectId: string; conversationId: string }): Promise<AutomationStudioConversationAsk[]>;
  getAsk(input: { projectId: string; askId: string }): Promise<AutomationStudioConversationAsk | null>;
};

/** Everything one run of a command works with. */
export type AutomationStudioConversationCommandContext = {
  port: AutomationStudioConversationCommandPort;
  host: AutomationStudioConversationCommandHost;
  projectId: string;
  conversationId: string;
  /**
   * The session the calls run under: the person's own, or for a paired client
   * the person's unlocked session (`caller.ts`). The build endpoints check it
   * against the request's actor, so it travels as `authSessionId`.
   */
  sessionId: string;
  /** True for a paired client whose person has no unlocked session: a build or run will find the key locked. */
  keyLocked: boolean;
  /** The page the person has open, as a build's start location. Null when none was sent. */
  startLocation: string | null;
  /**
   * What the chat's reading of the person's message cost in US dollars, when
   * the model priced it. A build the command runs carries it in the Flow's
   * creation purse, because the call that decided to build the Flow is part of
   * what the Flow cost (`build.ts`). Absent, nothing is carried.
   */
  interpretationCostUsd?: number;
};

/**
 * A question a command leaves in the thread after its result: "apply this?".
 * Granting it runs `capabilityId` with `arguments` through the executor.
 */
export type AutomationStudioConversationCommandConfirmation = {
  text: string;
  capabilityId: string;
  arguments: Record<string, string>;
  /** What saying yes would do, in Core's consequence classes. */
  consequences: AutomationStudioActionConsequence[];
  /** What the question is about, as the person would name it. */
  control: string;
};

/** What one command came to. `summary` is what the thread says. */
export type AutomationStudioConversationCommandOutcome = {
  status: "done" | "failed";
  summary: string;
  error?: string;
  flowId?: string;
  runId?: string;
  adaptationId?: string;
  /** Asked after the result is written, when the command's work needs a yes before it takes effect. */
  confirm?: AutomationStudioConversationCommandConfirmation;
};

/** What a command's first reply is written from: what was asked, and names the person would use. */
export type AutomationStudioConversationCommandAnnouncementView = {
  args: Record<string, unknown>;
  /** The name of the Flow the call is about, when it names one the thread was told of. */
  flowName: string | null;
  /** Where the work is tried, as a person names it (`../site-name.ts`): never an address. */
  place: string;
};

/** A capability Core runs itself. */
export type AutomationStudioConversationCommand = {
  /** What the model is shown. It replaces whatever a client sent under the same id. */
  capability: AutomationStudioPanelCapability;
  /** True for work that takes minutes: it runs after the request has answered, and its result arrives as a turn. */
  background: boolean;
  /**
   * The thread's first reply when the chat chooses this command: what will be
   * done, for the person, in plain words and without the command's title
   * (UI D9: the chat read `Doing "Create an automation here".`). Absent, the
   * reply says only what it is on (`../instructions/respond.ts`).
   */
  announce?(view: AutomationStudioConversationCommandAnnouncementView): string;
  run(context: AutomationStudioConversationCommandContext, args: Record<string, unknown>): Promise<AutomationStudioConversationCommandOutcome>;
};

/**
 * `append-turn`'s `response.execution`: what Core did with the capability it
 * chose. `started` means the work is running and its result will arrive in the
 * thread as an automation turn with a `panel-capability-result` attachment.
 */
export type AutomationStudioConversationCommandExecution = {
  capabilityId: string;
  status: "done" | "started" | "failed";
  summary: string;
  error?: string;
  flowId?: string;
  runId?: string;
  adaptationId?: string;
};
