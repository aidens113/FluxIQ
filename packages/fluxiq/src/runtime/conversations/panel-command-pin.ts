// The one answer that takes the person's PIN: a `panel-command.` confirmation.
//
// A permission ask or a question a run waits on never takes one, for anyone,
// whatever class it names: an answer there is a step inside a Flow or a chat,
// and the person's press stands, as a paired client's always has.
//
// A `panel-command.` confirmation is not a step inside a Flow. It is a one-off
// command from chat, and the panel runs the capability it carries with the PIN
// the person types; that capability endpoint refuses a wrong one. It is checked
// here as well, because by then the ask is settled and could not be answered
// again.
//
// A refusal is safe whatever it refuses, so `deny` never takes one.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../action-permission-requests/client/index.ts";
import type { AutomationStudioActionConsequence } from "../action-permission-requests/index.ts";
import type { AutomationStudioConversationAsk } from "./ask.ts";

/** The ask id prefix of a confirmation whose invocation the panel runs (`instructions/respond.ts`). */
export const AUTOMATION_STUDIO_PANEL_COMMAND_ASK_PREFIX = "panel-command.";

type AnsweredAsk = Pick<AutomationStudioConversationAsk, "askId" | "kind" | "missing" | "consequences">;

/**
 * The classes a person has to be asked about that answering this ask would
 * commit, in Core's order. A permission ask commits what it lacks (`missing`);
 * any other ask commits what it says it does.
 */
export function automationStudioConversationAskGatedClasses(ask: Pick<AnsweredAsk, "kind" | "missing" | "consequences">): AutomationStudioActionConsequence[] {
  const classes = ask.kind === "permission" ? (ask.missing ?? ask.consequences ?? []) : (ask.consequences ?? []);
  return AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES.filter((consequence) => classes.includes(consequence));
}

/** Whether an answer of `answerKind` to `ask` is a panel command's confirmation naming a gated class, and so needs the PIN. */
export function automationStudioPanelCommandAnswerNeedsPin(ask: AnsweredAsk, answerKind: string): boolean {
  if (answerKind === "deny" || !ask.askId.startsWith(AUTOMATION_STUDIO_PANEL_COMMAND_ASK_PREFIX)) return false;
  return automationStudioConversationAskGatedClasses(ask).length > 0;
}
