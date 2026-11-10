// What one message's work holds while it runs: who for, where, what may be
// spent, what the model has been told so far, and how a step reaches the thread.

import type { AutomationStudioConversationAttachment } from "../../turn.ts";
import type { PanelAssistantThreads } from "../store/index.ts";
import type { PanelAssistantActor, PanelAssistantClientAction, PanelAssistantContext, PanelAssistantModelTurn, PanelAssistantPrograms, PanelAssistantScope } from "../types.ts";
import type { PanelAssistantLoopWatch } from "./loop-watch.ts";
import type { PanelAssistantPurse } from "./purse.ts";

/** How a message's work ended. */
export type PanelAssistantTurnEnding =
  /** The model answered the person. */
  | "replied"
  /** A consequential call waits on the person's Allow. */
  | "asked"
  /** The message's spending allowance was used up. */
  | "allowance"
  /** Loop detection stopped a repeat that steering and refusing did not. */
  | "loop"
  /** The model failed in a way trying again does not fix. */
  | "model_failed"
  /** There is no model to ask: no key yet, or one the assistant cannot use. */
  | "no_model"
  /** The message's work was stopped from outside (shutdown). */
  | "stopped"
  /** Something in the panel failed while working; the thread says what. */
  | "failed";

/** What a message's work came to: how it ended, what it spent, and what the dock should show. */
export type PanelAssistantTurnOutcome = { ending: PanelAssistantTurnEnding; spentUsd: number; clientActions: PanelAssistantClientAction[] };

/** One message's work in flight. */
export type PanelAssistantTurnState<TActor extends PanelAssistantActor> = {
  programs: PanelAssistantPrograms<TActor>;
  threads: PanelAssistantThreads;
  actor: TActor;
  scope: PanelAssistantScope;
  conversationId: string;
  /** The person's latest words: what a consequential call must be clearly asked for in. */
  words: string;
  context: PanelAssistantContext;
  purse: PanelAssistantPurse;
  watch: PanelAssistantLoopWatch;
  /** What this message's work has told the model, after the thread itself. */
  entries: PanelAssistantModelTurn[];
  clientActions: PanelAssistantClientAction[];
  /** Writes one turn of the assistant's into the thread. */
  post(text: string, attachment?: AutomationStudioConversationAttachment): Promise<void>;
};
