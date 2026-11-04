// Which answers to a question need the person's PIN.
//
// An answer is the person's authority for what follows it only where nothing
// after it checks again:
//
// - A permission ask raised by the action gate: a grant widens what the run
//   holds and the run carries on to the act. Nothing stands between them.
// - A question a run waits on (`parks`) that names a gated class: its route goes
//   on to what the class names.
// - A `panel-command.` confirmation: the panel runs the capability it carries
//   with this same PIN, and that endpoint refuses a wrong one. Checked here as
//   well, because by then the ask is settled and could not be answered again.
//
// Everything else takes no PIN. `modify_existing` and `create_new` are not
// classes a person has to be asked about (`destructive.ts`), so a yes to "apply
// this change?" may be typed or pressed. An ask that parks nothing and carries
// no invocation, such as the declaration cross-check's "apply it as it stands?",
// has no reader: no act depends on it, so asking for a secret there would only
// teach people to type it without reading.
//
// A refusal is safe whatever it refuses, so `deny` never takes one.

import { AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES } from "../action-permission-requests/client/index.ts";
import type { AutomationStudioActionConsequence } from "../action-permission-requests/index.ts";
import type { AutomationStudioConversationAsk } from "./ask.ts";

/** The ask id prefix of a confirmation whose invocation the panel runs (`instructions/respond.ts`). */
export const AUTOMATION_STUDIO_PANEL_COMMAND_ASK_PREFIX = "panel-command.";

type AnsweredAsk = Pick<AutomationStudioConversationAsk, "askId" | "kind" | "parks" | "missing" | "consequences">;

/**
 * The classes a person has to be asked about that answering this ask would
 * commit, in Core's order. A permission ask commits what it lacks (`missing`);
 * any other ask commits what it says it does.
 */
export function automationStudioConversationAskGatedClasses(ask: Pick<AnsweredAsk, "kind" | "missing" | "consequences">): AutomationStudioActionConsequence[] {
  const classes = ask.kind === "permission" ? (ask.missing ?? ask.consequences ?? []) : (ask.consequences ?? []);
  return AUTOMATION_STUDIO_DESTRUCTIVE_ACTION_CONSEQUENCES.filter((consequence) => classes.includes(consequence));
}

/** Whether an answer of `answerKind` to `ask` is the person's authority for an act, and so needs their PIN. */
export function automationStudioConversationAnswerNeedsPin(ask: AnsweredAsk, answerKind: string): boolean {
  if (answerKind === "deny" || !automationStudioConversationAskGatedClasses(ask).length) return false;
  return ask.kind === "permission" || ask.parks || ask.askId.startsWith(AUTOMATION_STUDIO_PANEL_COMMAND_ASK_PREFIX);
}
