// The one account of a project build's ending, for its ending row (t753).
//
// Round 5's failed and partial builds ended on three stacked paragraphs: the
// ending row, the command's answer and the draft's card line, each saying the
// verdict again ("It was never test-run from the start ... Saved candidate
// draft. It was never test-run from the start"), one contradicting another
// ("left no change on the site" beside a reason saying changes were left), and
// the reason stuttering after Core's words ("could not finish the Flow: I could
// not finish this"). The row is now the one place that says the ending, in
// this order, each once:
//
// 1. why: the supervisor's own reason, screened as every reason a model gives
//    is (`activity/wording/ended-reason.ts`), with its claims of how a part's
//    test went left out where Core's record is said (`./reason-checked.ts`),
//    its opening restatement of the ending left out (`./reason-unrepeated.ts`),
//    and Core's ledger note, which the build record keeps after the model's
//    words, cut from its end;
// 2. Core's record of its tests (`./record-told.ts`);
// 3. what Core last read of the pages the build acted on (t791), where a claim of the site's state those readings
//    contradict is left out of the reason (`./reason-contradicted.ts`, `./readings-told.ts`);
// 4. what is left on the site, in a person's words
//    (`activity/wording/left-told.ts`), or that nothing is.
//
// The row's title says what happened; the commands that hand the result back
// say only what the Flow keeps and what the person can do next
// (`./codes.ts`, `conversations/commands/`).

import { automationStudioActivityEndedReason } from "../../activity/index.ts";
import type { AutomationStudioProjectBuildReading } from "./reading.ts";
import { automationStudioProjectBuildReadingsTold } from "./readings-told.ts";
import { automationStudioProjectBuildReasonNothingChanged } from "./reason-nothing-changed.ts";
import { automationStudioProjectBuildReasonContradicted } from "./reason-contradicted.ts";
import { automationStudioProjectBuildReasonChecked } from "./reason-checked.ts";
import { automationStudioProjectBuildReasonUnrepeated } from "./reason-unrepeated.ts";

/** The most of the supervisor's reason the row says (t649). */
const MAX_ENDED_REASON = 240;
/** That the build knows of nothing it left: Core's words, as `activity/wording/left-told.ts` says them. */
const NOTHING_LEFT = "The build left no change on the site that it knows of.";

/**
 * The ending's account (header): `why`, the supervisor's reason as said, or
 * undefined when nothing of it is plain or beyond a restatement; `text`, the
 * whole row; `left`, what is left as said. `left` given is Core's note of what
 * is left and its person's words (`told`), as the supervisor named them.
 */
export function automationStudioProjectBuildEndingTold(input: {
  reason: string;
  left: { note: string | undefined; told?: string } | undefined;
  record?: string | undefined;
  /** What Core last read of the pages the build acted on (header, t791). */
  readings?: readonly AutomationStudioProjectBuildReading[] | undefined;
}): { why: string | undefined; text: string; left: string } {
  const { left, record } = input;
  const readings = input.readings ?? [];
  // Core's note goes after the model's words in the record: cut, and said last in a person's words (header).
  const own = left?.note && input.reason.endsWith(left.note) ? input.reason.slice(0, -left.note.length) : input.reason;
  // A claim of the site's state that Core's own readings contradict gives way to the readings (t791).
  // A claim that nothing changed gives way where the ledger holds an act left on the site (t791, fix 5b).
  const owned = left?.note !== undefined ? automationStudioProjectBuildReasonNothingChanged(own) : own;
  const uncontradicted = readings.length ? automationStudioProjectBuildReasonContradicted(owned, readings) : owned;
  const checked = automationStudioProjectBuildReasonUnrepeated(record ? automationStudioProjectBuildReasonChecked(uncontradicted, /\bstored (?:\d+ rows?|no rows)\b/u.test(record)) : uncontradicted);
  const why = checked ? automationStudioActivityEndedReason(checked, MAX_ENDED_REASON) : undefined;
  const leftSaid = left?.note !== undefined ? left.told ?? left.note : NOTHING_LEFT;
  const sentences = [why ? (/[.!?…]$/u.test(why) ? why : `${why}.`) : "", record ?? "", automationStudioProjectBuildReadingsTold(readings) ?? "", leftSaid].filter((sentence) => sentence);
  return { why: why || undefined, text: sentences.join(" "), left: leftSaid };
}
