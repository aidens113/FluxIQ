import { activityActionReplayFailing } from "./replay-failing.ts";
import type { ActivityActionKind } from "./types.ts";

/**
 * One reason's words: `why`, and `read` where a list read says it in a
 * list's words ("FluxIQ didn't read it"), since a read sends nothing to a
 * control.
 */
type Reason = { words: RegExp; why: string; read?: string };

/**
 * Short reasons, each told by the words a result code ends with. Generic words
 * only; the first that matches decides.
 */
const REASONS: readonly Reason[] = [
  // A layer in front of the control is not the control being hidden, and a
  // dialog in the way is not a refusal: "it was hidden on the page" and "it
  // wasn't allowed" were said of a press a coupon popup covered (crossborder
  // `run-muqc07fh-eeffbc86`, t193 run 39). Checked first, so `blocked_by_dialog`
  // is not read as `blocked`.
  { words: /_(dialog|blocked_by_dialog|modal)_/u, why: "a dialog on the page was in front of it" },
  { words: /_(covered|obscured|overlaid|covered_by_layer)_/u, why: "a popup or banner on the page was covering it" },
  // A call naming something FluxIQ had not seen (`target_unobserved`) was never
  // sent, and nothing was looked for on the page: a list read refused so read
  // "Read list · Didn't work: it wasn't on the page" beside the list in plain
  // sight (R2-U-6, `run-muwansvz-a2b4a987`, moment 07). Before the page miss.
  {
    words: /_(unobserved)_/u,
    why: "FluxIQ didn't send it, as the step named something it hadn't seen on the page",
    read: "FluxIQ didn't read it, as the step named a list it hadn't seen on the page"
  },
  { words: /_(not_found|missing|no_match|absent|gone)_/u, why: "it wasn't on the page" },
  { words: /_(timeout|timed_out|too_slow|slow)_/u, why: "the page took too long" },
  { words: /_(ambiguous|multiple_matches|many_matches)_/u, why: "more than one thing on the page matched" },
  { words: /_(not_visible|hidden|offscreen)_/u, why: "it was hidden on the page" },
  { words: /_(disabled|not_enabled|readonly|read_only)_/u, why: "it couldn't be used yet" },
  { words: /_(detached|stale|changed|moved)_/u, why: "the page changed before it could" },
  { words: /_(intervention|check_required|human_check)_/u, why: "the page wanted a person" },
  // A page that said it was busy, by its code or by the refusal's reason
  // (`page_busy_try_later`): checked before `refused_by_page`, whose "the page
  // turned it down" was said of a press the page was only too busy to take
  // (t174-w85 D8, `run-murwd8le-79e735a8`).
  //
  // A site that said FluxIQ was going too fast (`web.action.rate_limited`, the
  // site's "You're going too fast" notice with a wait in it) asked it to slow
  // down, which "the page was busy" did not say (lane D, `run-mv0fuual-f9e6f089`,
  // finding 1). Before the busy page, whose `try_later` it may also carry.
  { words: /_(rate_limited|throttled|too_many_requests|too_fast|slow_down)_/u, why: "the site asked FluxIQ to slow down" },
  { words: /_(busy|try_later)_/u, why: "the page was busy" },
  // The page's own answer to a press, not a permission: "Please select a
  // Color." beside Add to cart would read "it wasn't allowed" (crossborder
  // `run-muqk4u32-0b36e58f`, t174 F40). Checked before `refused`.
  { words: /_(refused_by_page|declined_by_page)_/u, why: "the page turned it down" },
  { words: /_(denied|forbidden|refused|blocked|not_allowed|permission)_/u, why: "it wasn't allowed" },
  { words: /_(invalid|malformed|rejected|unsupported)_/u, why: "the step wasn't accepted" },
  { words: /_(network|offline|unreachable|navigation_failed|load_failed)_/u, why: "the page didn't load" },
  { words: /_(no_progress|without_progress|repeat)_/u, why: "it made no progress" },
  { words: /_(cancelled|canceled|aborted)_/u, why: "it was stopped" }
];

/**
 * Words only a refusal's own reason can say, which no result code does. A call
 * refused because it named no control from the page (`target_not_a_handle`)
 * read "it wasn't on the page" from its code (`target_unobserved`), when
 * nothing had been looked up at all (t193, `run-muqiojz4-04a7a8fc`, `S/0090`).
 * Generic words of a reason, as `REASONS` holds generic words of a code.
 *
 * Such a call was never sent to the page: FluxIQ refused it for what it named.
 * "Didn't work: it didn't name a control from the page" read as the page
 * failing the step (U7, live run `run-musp39u8-9ac026ab`, moment 26), so the
 * words say FluxIQ did not send it, and why.
 */
const REFUSAL_REASONS: readonly Reason[] = [
  // A handle from a page view older than the one the call was checked against:
  // the control was in plain sight, and "it wasn't on the page" said it was
  // missing (t174-w111 D17, `run-musq0b1m-0472cfa0`, steps 0063 and 0067).
  { words: /_(handle_not_in_packet|handle_from_older_view|stale_handle)_/u, why: "FluxIQ was looking at an older view of the page" },
  // "since it named no control from the page" was FluxIQ's own term for a
  // handle, and read beside "it wasn't on the page" for the same step as two
  // stories (U-12, `run-muw60j7c-bb7c9a62`, moment 14).
  {
    words: /_(not_a_handle|malformed_handle|handle_in_wrong_parameter)_/u,
    why: "FluxIQ didn't send it, as the step didn't say which control on the page to use",
    read: "FluxIQ didn't read it, as the step didn't say which list on the page to read"
  },
  // The same refusal given again, which a domain may say in place of its cause
  // (`answered_the_same_again`): the cause was said on the first of them, and
  // the chat's observer carries it onto the repeats where it saw it
  // (`programs/automation-studio/runtime/activity/repeated-reason.ts`). Never a
  // page miss: the repeats of a list read refused for its list read "it wasn't
  // on the page" (R2-U-6, `run-muwansvz-a2b4a987`, steps 0039 and 0046).
  { words: /_(answered_the_same_again|same_answer_again)_/u, why: "FluxIQ didn't send it, for the same reason as the time before", read: "FluxIQ didn't read it, for the same reason as the time before" },
  // A lasting act whose failure left its effect unknown, which the run did not
  // make again (`outcome_uncertain`, t359/t361): read from its code alone it
  // said "the page changed before it could" or nothing at all, when the step
  // may already have happened. Before `REASONS`, whose `changed` would say so.
  { words: /_(outcome_uncertain)_/u, why: "FluxIQ couldn't tell whether it took effect, so it didn't do it again" },
  // A step asked to run again exactly as it was (`changes_nothing`, the draft's
  // own refusal reason): nothing was looked for on the page.
  { words: /_(changes_nothing)_/u, why: "it was already tried exactly this way on this same page" },
  { words: /_(no_longer_on_page)_/u, why: "it was no longer on the page" },
  // What the call was written with, never the page: a press refused for
  // leaving out `consequences` read "it wasn't on the page", from the word
  // `missing` in `missing_input_keys` (t193 1002-M, `run-murzln6g-11debe1d`, C12).
  // Before `REASONS`, whose `missing` is a page word.
  { words: /_(missing_input_keys|missing_keys|missing_input)_/u, why: "the request left out something it needs" },
  { words: /_(unexpected_input_keys|unexpected_keys)_/u, why: "the request had something it doesn't take" },
  { words: /_(not_a_number|not_a_url|value_not_text)_/u, why: "a value in the request was the wrong kind" },
  // Before `REASONS`, whose `changed` would say the opposite of "nothing changed".
  { words: /_(nothing_changed|unchanged)_/u, why: "nothing on the page changed" }
];

/**
 * Why a step a test of the Flow ran did not hold, by its replay code
 * (`programs/automation-studio/runtime/llm/node-tools/replay.ts`). It read "it
 * didn't work the same way again" for all of them, so a card said "Didn't
 * work: it didn't work the same way again" -- the result twice and no reason
 * (t174-w111 D21, `run-musq0b1m-0472cfa0`).
 */
const REPLAY_REASONS: ReadonlyMap<string, string> = new Map([
  ["core.replay.failed", "it couldn't run when the test tried it again"],
  ["core.replay.changed", "it did nothing this time, where it did something before"],
  ["core.replay.unreproducible", "the page wasn't in the same state when the test got there"],
  ["core.replay.reset_failed", "the page couldn't be put back to where the Flow starts"]
]);
/** Any other replay code that did not hold. */
const REPLAY_OTHER = "it didn't do the same when the test tried it again";

/** Core's own namespace: its tools read what Core holds, never the page. */
const CORE_NAMESPACE = "core.";

/**
 * Core's own codes that `REASONS` would read as a page miss, by whole code. A
 * recall of a result nobody gave that name (`core.recall.not_found`) read
 * "it wasn't on the page" when it had looked at no page (t194,
 * `run-murwcmx2-a1c6edf7`, step 0036); the others say a standing
 * authorization, a result's values or a verdict was absent. Any other Core
 * code is never read as a page miss either (`CORE_CODE_REASONS`).
 */
const CORE_REASONS: ReadonlyMap<string, string> = new Map([
  ["core.recall.not_found", "no earlier result goes by that name"],
  ["core.check.authorization_absent", "checking had not been turned on for this Flow"],
  ["core.repair.authorization_absent", "repair had not been allowed for this Flow"],
  ["core.result.required_values_missing", "the result was missing values the request needs"],
  ["core.result.verdict_absent", "no verdict came back"]
]);

/** `REASONS` without its page miss or its unseen target, for a Core code. */
const CORE_CODE_REASONS = REASONS.filter((candidate) => !candidate.words.test("_not_found_") && !candidate.words.test("_unobserved_"));

/** A table's words for a code segment or a reason, written `_like_this_`, in a list's words for a read. */
function reasonFor(table: readonly Reason[], words: string, kind: ActivityActionKind | undefined): string | null {
  const reason = table.find((candidate) => candidate.words.test(words));
  if (!reason) return null;
  return kind === "read" && reason.read !== undefined ? reason.read : reason.why;
}

/**
 * Why an action failed, in a few plain words. A refusal's own `reason` (the
 * caller's code for why the call came to its result) decides first, when its
 * words say something; else the result code's last words do
 * ("web.target.not_found" -> "it wasn't on the page"). Null when neither names
 * a reason this knows; never the code or the reason itself. A Core code
 * (`core.*`) is never a page miss: Core's own words for it come from
 * `CORE_REASONS`. Nor is a call that named something FluxIQ had not seen
 * (`unobserved`), the same refusal given again, or a step asked to run
 * again unchanged: none of them looked at the page. `kind`, the card's kind
 * where the caller knows it, has a list read said in a list's words.
 */
export function activityActionFailureReason(resultCode: string, reason?: string, kind?: ActivityActionKind): string | null {
  const code = resultCode.trim().toLowerCase();
  const reasons = code.startsWith(CORE_NAMESPACE) ? CORE_CODE_REASONS : REASONS;
  const said = reason?.trim().toLowerCase().replace(/[\s.-]+/gu, "_");
  if (said) {
    const why = reasonFor(REFUSAL_REASONS, `_${said}_`, kind) ?? reasonFor(reasons, `_${said}_`, kind);
    if (why) return why;
  }
  if (activityActionReplayFailing(code)) return REPLAY_REASONS.get(code) ?? REPLAY_OTHER;
  const own = CORE_REASONS.get(code);
  if (own) return own;
  const segments = code.split(".").map((segment) => `_${segment.replace(/[\s-]+/gu, "_")}_`);
  // The last segment first, then each one before it back to the second: the
  // first segment is a namespace, not a reason.
  const ordered = [segments.at(-1) ?? "", ...segments.slice(1, -1).reverse()];
  for (const segment of ordered) {
    const why = reasonFor(reasons, segment, kind);
    if (why) return why;
  }
  return null;
}
