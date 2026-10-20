// What a call Core rejected before sending it says, as an outcome a person
// reads after the action's dash.
//
// A `web.action.rejected.*` code is FluxIQ declining to send a call, never
// the page failing it: nothing was looked up or pressed. Its target code
// (`target_unobserved`) read "couldn't find it on the page" for a list read
// whose step named no list properly (reason `malformed_handle`) while the list
// was in plain sight (R2-U-6 of the run-muwansvz-a2b4a987 UI review, steps
// 0034, 0039 and 0046). So a rejected call is "not tried", and, when the row
// carries the caller's reason (`Reason: <code>` in its record), why: Core's
// own words for that reason (`activityActionFailureReason`, the words its card
// says), less the "FluxIQ didn't send it, as" its card opens with, which "not
// tried" already says. A step reading a list names the list, not a control
// ("the step didn't name its list the way FluxIQ needs"). Without a reason, the code's own
// last words say why when they say something other than a page miss
// ("a popup or banner on the page was covering it"); a page miss is never
// said, since the page was not asked. Pure.

import { activityActionFailureReason } from "../activity-action/index.ts";

/** A result code for a call FluxIQ declined to send. */
const REJECTED = /(?:^|\.)rejected\./u;
/** The caller's reason in a row's record ("Result: X · Reason: Y · Node: Z"). */
const REASON = /(?:^|·\s*)Reason:\s*([^\s·]+)/u;
/** Core's words for a page miss, which a call never sent cannot have found. */
const PAGE_MISS = /\b(?:wasn't|was not|isn't) on the page\b|\bcouldn't find\b/u;
/** The opening of Core's card words for a call it did not send: "FluxIQ didn't send it, as …". */
const NOT_SENT = /^FluxIQ didn't \w+ it,? (?:(?:as|because|since) |(?=for ))/u;
/** Core's words for a step that did not name its control as FluxIQ needs (by a handle from the page, and only so). */
const NO_CONTROL = /^the step didn't name its (?:control|list) the way FluxIQ needs$/u;
/** An action reading a list: "Reading the list of …", "Trying again: reading the list of …". */
const READS_LIST = /\blist\b/iu;
/**
 * A rejected code whose own words say the step ran and its effect did not
 * show (`web.action.rejected.output_not_observed`: the site set a cleared box
 * back). It was tried, and "not tried: it ran, but ..." said both (R4a). It is
 * left to the outcome a failed step reads, in Core's card words.
 */
const RAN = /\.(?:output_not_observed|not_observed|state_mismatch)$/u;

const NOT_TRIED = "not tried";

/**
 * The outcome for `code` when FluxIQ rejected the call before sending it,
 * else undefined. `record` is the row's `detail.text`; `action` is what the
 * call does, in words, so a list read names a list.
 */
export function notTriedOutcome(code: string, record: string | undefined, action: string): string | undefined {
  if (!REJECTED.test(code) || RAN.test(code)) return undefined;
  const reason = REASON.exec(record ?? "")?.[1];
  const tail = code.split(".").at(-1) ?? "";
  const why = (reason ? activityActionFailureReason("", reason) : null) ?? (tail ? activityActionFailureReason(`web.${tail}`) : null);
  const said = why?.replace(NOT_SENT, "").trim();
  if (!said || PAGE_MISS.test(said)) return NOT_TRIED;
  // A repeat Core could not trace to its first refusal (`answered_the_same_again`): "not tried, for the same reason as the time before".
  if (said.startsWith("for ")) return `${NOT_TRIED}, ${said}`;
  return `${NOT_TRIED}: ${NO_CONTROL.test(said) && READS_LIST.test(action) ? "the step didn't name its list the way FluxIQ needs" : said}`;
}
