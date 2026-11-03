// One answer never says both that a call can meet its act's condition and
// that no call can settle that act (t772 R2, rerun round 6
// `run-mvrj7qg9-b6dc94f6`, cause 2; t797 P4 item 3). An undo refused there said
// "another call on this page can meet it" (`canMeet: this_page`) beside an
// `actsUnsettleable` that listed the very act it refused, as one no call could
// put back; the reset builder believed the list, gave the act up, and its brief
// ended blocked.
//
// **The ledger's verdict is the one answer (t797).** Whether an act can still be
// settled is the site-reset ledger's to say, once, for every answer
// (`../reset-ledger/answers.ts`, `unsatisfiable`): the trial's `startedWith`,
// the ending and every refusal read it there. A refusal's `canMeet` says only
// whether another call could meet the one condition this call failed, and it
// cannot know that the act has no admissible call left at all. So where a
// refusal names its own act (`act`) and says a call on this page or another
// can meet it, while the acts listed beside it no call can settle
// (`actsUnsettleable`) hold that act, the refusal follows the ledger: no call
// can meet it (`no_call`), its `condition` is said again in those words, its
// instruction says the act is listed apart, and it is never listed among the
// acts to undo. t772 moved the act back among the acts to undo instead; that
// answer then read as one, but the next answer listed it apart again, and the
// builder was sent round a press the ledger knew could never settle it.
//
// The ledger lists an act apart only when no call it may make is admitted for
// any reason left open (`../reset-settlement/judge.ts`, `unmet`;
// `../reset-undo/reach.ts`), never on a read that says nothing yet
// (`../reset-settlement/observations.ts`, `readInPlace`), which is what made
// t772 R2's case false at its source. The refusal constructor (`./refusal.ts`)
// applies this check, and so does the ledger where it lists acts no call can
// settle beside a refusal it did not build (`../reset-ledger/claims.ts`,
// `target`). A refusal whose own act is not listed apart, or that no call can
// meet already, passes through unchanged.

import { AUTOMATION_STUDIO_SITE_RESET_CAN_MEET } from "./can-meet.ts";
import { automationStudioSiteResetConditionWords as conditionWords } from "./condition-words.ts";
import { AUTOMATION_STUDIO_SITE_RESET_FAILED, type AutomationStudioSiteResetFailed } from "./failed.ts";

/** The fields of an answer this check reads; any other passes through. */
type Answer = { act?: unknown; failed?: unknown; canMeet?: unknown; condition?: unknown; instruction?: unknown; actsUnsettleable?: unknown; actsToUndo?: unknown };

/** What a refusal whose own act the ledger lists apart is told to do (header). Generic: it names no site, item or task. */
export const AUTOMATION_STUDIO_SITE_RESET_LISTED_APART =
  "This act is listed under actsUnsettleable: no call this build may make can settle it, so do not undo it again or make a variation of this call. Go on with the acts still to undo, if any; a trial still runs with it said as possibly left.";

const FAILED: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_SITE_RESET_FAILED);
const MEETABLE: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_SITE_RESET_CAN_MEET.filter((canMeet) => canMeet !== "no_call"));

/** `answer`, met by no call where its own act is among the acts listed beside it that no call can settle (header). */
export function automationStudioSiteResetAnswerAgreeing<A extends object>(answer: A): A {
  const said: Answer = answer;
  const act = said.act;
  if (typeof act !== "string" || typeof said.canMeet !== "string" || !MEETABLE.has(said.canMeet) || !Array.isArray(said.actsUnsettleable)) return answer;
  if (!said.actsUnsettleable.some((entry) => named(entry) === act)) return answer;
  const toUndo = Array.isArray(said.actsToUndo) ? said.actsToUndo.filter((entry) => named(entry) !== act) : said.actsToUndo;
  const condition = typeof said.failed === "string" && FAILED.has(said.failed) && "condition" in said ? { condition: conditionWords(said.failed as AutomationStudioSiteResetFailed, "no_call") } : {};
  return { ...said, canMeet: "no_call", ...condition, instruction: AUTOMATION_STUDIO_SITE_RESET_LISTED_APART, ...(toUndo !== undefined ? { actsToUndo: toUndo } : {}) } as unknown as A;
}

/** The act an entry of either list names. */
function named(entry: unknown): unknown {
  return typeof entry === "object" && entry !== null ? (entry as { act?: unknown }).act : undefined;
}
