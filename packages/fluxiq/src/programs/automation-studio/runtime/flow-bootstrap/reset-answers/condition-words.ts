// The words for each condition a site-reset refusal names as failed, and for
// whether any call can meet it (t743, the actionable-answer contract). They sit
// beside the closed set (`./failed.ts`) so the constructor (`./refusal.ts`)
// needs nothing from site-reset itself, and site-reset depends on this
// directory one way only. Moved here whole from `../site-reset/words.ts`, which
// says them through `condition`. Generic by rule: no site, page, product or
// task is named (AGENTS.md, "Model guidance never teaches to the test").

import type { AutomationStudioSiteResetCanMeet } from "./can-meet.ts";
import type { AutomationStudioSiteResetFailed } from "./failed.ts";

/**
 * Each condition a refusal can name as failed (`./answers/`, t743), in generic
 * words: what about this call or the site does not hold, so the model never
 * has to guess at it.
 */
const CONDITIONS: Readonly<Record<AutomationStudioSiteResetFailed, string>> = {
  already_back: "The act is already back: its own control already shows the state this build found it in, or fresh complete reads show everything it could change as this build found it, so there is nothing to press back or undo.",
  control_state_differs: "The act's own control shows neither the state this build found it in nor the state the act set, so pressing it is not the act's inverse.",
  control_elsewhere: "This control is not the act's own control: that one is at another place.",
  consequence_not_inverse: "The lasting classes this call declared do not reverse the act's: an undo declares only the classes that reverse what the act did, and nothing else lasting.",
  undeclared_press: "This call declared no lasting class on a control tied to an item, so it cannot be told apart from an undeclared press.",
  subject_differs: "This control is about a different item than the one the act was about.",
  no_item_identity: "This control carries no title of the item it is about, so nothing ties it to the act.",
  no_destination_read_before: "The list this would remove the item from was not read complete before the act, so nothing proves the item was absent there before this build.",
  destination_not_read_now: "The list this control sits in has not been read completely since the latest change, so nothing shows what it holds now.",
  subject_there_before: "The item was already in that list before the act, so removing it would change what was there before the build began.",
  subject_not_present_now: "The item is not in that list now, so nothing of the act's is there to remove.",
  no_exact_inverse: "The act changed something that already existed, and no check here can prove an exact inverse of that change.",
  transfer_not_witnessed: "Fresh complete reads do not show the item the act moved where the act put it, in the state the act left it.",
  not_own_item: "This control is not on the item the act acted on, nor on anything the act created.",
  act_kept: "This act is kept: the site offered no control that undoes it.",
  act_left: "This act is left on the site: nothing it could change showed a change.",
  act_not_listed: "The act named under undoes is not one this build may undo now.",
  undo_spent: "This act's one unasked undo already landed.",
  destination_unissued: "The resetDestination named is a ref this build was never shown.",
  acts_in_place: "Acts this build made are still on the site.",
  acts_not_settled: "Reversible acts of this build are not settled.",
  start_differs: "The site still differs from how this build found it.",
  witness_unreachable: "The only lists that could show this act put back cannot be read again: Core's own look at where they were read does not show them.",
  nothing_to_name: "Nothing read shows where this act's effect would be, and no list can be named for it any more.",
  no_admissible_undo: "No call this build may make can put back what still differs: it is not an item this build added that an undo here may remove, and no control of the act's own can be pressed back to how this build found it.",
  no_baseline: "The act's own control was never read before this build acted at its place, so no read can show it put back as this build found it.",
  acts_unsettleable: "Acts this build made are still on the site, and no call can settle them: nothing that can still be read would show them put back.",
  no_witness: "Nothing could ever show this press put back: no list it would show in was read complete, no ref names one, its control shows no state of its own, and it repeats no witnessed press this build made while exploring.",
  no_target_identity: "The lasting step has no target identity, so nothing identifies what this build would change or restore.",
  no_destination_original: "No complete original read of the list where this creation would show proves its item absent there."
};

/** Whether any call can meet a failed condition, and where (`./refusal.ts`). */
const MEETS: Readonly<Record<AutomationStudioSiteResetCanMeet, string>> = {
  this_page: "Another call on this page can meet it, as instruction says.",
  another_page: "No call on this control can meet it; a call where instruction points can.",
  no_call: "No call can meet it: do not make this call, or a variation of it, again."
};

/** A refusal's failed condition and whether any call can meet it, in generic words. */
export function automationStudioSiteResetConditionWords(failed: AutomationStudioSiteResetFailed, canMeet: AutomationStudioSiteResetCanMeet): string {
  return `${CONDITIONS[failed]} ${MEETS[canMeet]}`;
}
