// A person's turn read as an instruction: what travels with it, what comes
// back, and the end of the thread as the model reads it.
//
// The collaborator (`../conversations.ts`) stores the turn and runs the steps;
// the shapes and the transcript bound live here beside the steps they feed.

import type { AutomationStudioPanelCapability } from "../../panel-capabilities/index.ts";
import type { AutomationStudioConversationPersonTurnRequest } from "../conversations.ts";
import type { AutomationStudioConversationTurn } from "../turn.ts";
import type { AutomationStudioConversationFlowReference, AutomationStudioConversationOnScreen, AutomationStudioConversationResponse } from "./decision.ts";
import type { AutomationStudioConversationInterpretLimits } from "./interpret.ts";
import type { AutomationStudioConversationCaller, AutomationStudioConversationModelTurn } from "./model.ts";

/**
 * A person's turn that is also read as an instruction: the panel's vocabulary,
 * the project's Flows and what is on screen travel with it.
 */
export type AutomationStudioConversationInstructionRequest = AutomationStudioConversationPersonTurnRequest & {
  capabilities: readonly AutomationStudioPanelCapability[];
  /** Null when the Flows could not be listed; the model is told so and a written name is passed on as written. */
  flows: readonly AutomationStudioConversationFlowReference[] | null;
  onScreen: AutomationStudioConversationOnScreen;
  /** Who sent it, from the request's actor. The model's key is released only to this person's unlocked session. */
  caller?: AutomationStudioConversationCaller | null;
  /** Tests shorten the model's time budget; production takes the defaults. */
  limits?: Partial<AutomationStudioConversationInterpretLimits>;
};

/**
 * The person's turn, stored first, and what it became. `response` is null only
 * when the answer could not be written into the thread; `problem` then says why
 * in words, and the person's own turn is still there.
 */
export type AutomationStudioConversationInstructionAnswer = {
  turn: AutomationStudioConversationTurn;
  response: AutomationStudioConversationResponse | null;
  problem: string | null;
};

/** How much of the thread the model reads before the new message. */
export const AUTOMATION_STUDIO_CONVERSATION_TRANSCRIPT_TURNS = 20;
const TRANSCRIPT_TURN_TEXT_MAX = 1_500;

/**
 * The attachment kind the panel records what it did under. Read back as the
 * panel speaking, not the person: the panel writes it on the person's behalf
 * through the person's own endpoint, and a model that took "Started the run"
 * as something the person said would misread the thread.
 */
export const AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT = "panel-capability-result";

/** The turns before `excludeTurnId`, bounded, as the model reads them. Empty turns are left out. */
export function automationStudioConversationModelTranscript(
  turns: readonly AutomationStudioConversationTurn[],
  excludeTurnId: string
): AutomationStudioConversationModelTurn[] {
  return turns
    .filter((entry) => entry.turnId !== excludeTurnId && entry.text.trim())
    .slice(-AUTOMATION_STUDIO_CONVERSATION_TRANSCRIPT_TURNS)
    .map((entry): AutomationStudioConversationModelTurn => ({
      author: entry.attachment?.kind === AUTOMATION_STUDIO_PANEL_CAPABILITY_RESULT_ATTACHMENT ? "panel" : entry.author,
      text: entry.text.length > TRANSCRIPT_TURN_TEXT_MAX ? `${entry.text.slice(0, TRANSCRIPT_TURN_TEXT_MAX - 1)}…` : entry.text
    }));
}
