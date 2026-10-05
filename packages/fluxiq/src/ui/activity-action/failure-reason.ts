import { activityActionReplayFailing } from "./replay-failing.ts";

/**
 * Short reasons, each told by the words a result code ends with. Generic words
 * only; the first that matches decides.
 */
const REASONS: readonly { words: RegExp; why: string }[] = [
  // A layer in front of the control is not the control being hidden, and a
  // dialog in the way is not a refusal: "it was hidden on the page" and "it
  // wasn't allowed" were said of a press a coupon popup covered (crossborder
  // `run-muqc07fh-eeffbc86`, t193 run 39). Checked first, so `blocked_by_dialog`
  // is not read as `blocked`.
  { words: /_(dialog|blocked_by_dialog|modal)_/u, why: "a dialog on the page was in front of it" },
  { words: /_(covered|obscured|overlaid|covered_by_layer)_/u, why: "a popup or banner on the page was covering it" },
  { words: /_(not_found|missing|unobserved|no_match|absent|gone)_/u, why: "it wasn't on the page" },
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
  { words: /_(busy|try_later|rate_limited|throttled|too_many_requests)_/u, why: "the page was busy" },
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
const REFUSAL_REASONS: readonly { words: RegExp; why: string }[] = [
  // A handle from a page view older than the one the call was checked against:
  // the control was in plain sight, and "it wasn't on the page" said it was
  // missing (t174-w111 D17, `run-musq0b1m-0472cfa0`, steps 0063 and 0067).
  { words: /_(handle_not_in_packet|handle_from_older_view|stale_handle)_/u, why: "FluxIQ was looking at an older view of the page" },
  { words: /_(not_a_handle|malformed_handle|handle_in_wrong_parameter)_/u, why: "FluxIQ didn't send it, since it named no control from the page" },
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

/** `REASONS` without its page miss, for a Core code. */
const CORE_CODE_REASONS = REASONS.filter((candidate) => !candidate.words.test("_not_found_"));

/** `REASONS`' entry for a code segment or a reason, written `_like_this_`. */
function reasonFor(table: readonly { words: RegExp; why: string }[], words: string): string | null {
  return table.find((candidate) => candidate.words.test(words))?.why ?? null;
}

/**
 * Why an action failed, in a few plain words. A refusal's own `reason` (the
 * caller's code for why the call came to its result) decides first, when its
 * words say something; else the result code's last words do
 * ("web.target.not_found" -> "it wasn't on the page"). Null when neither names
 * a reason this knows; never the code or the reason itself. A Core code
 * (`core.*`) is never a page miss: Core's own words for it come from
 * `CORE_REASONS`.
 */
export function activityActionFailureReason(resultCode: string, reason?: string): string | null {
  const code = resultCode.trim().toLowerCase();
  const reasons = code.startsWith(CORE_NAMESPACE) ? CORE_CODE_REASONS : REASONS;
  const said = reason?.trim().toLowerCase().replace(/[\s.-]+/gu, "_");
  if (said) {
    const why = reasonFor(REFUSAL_REASONS, `_${said}_`) ?? reasonFor(reasons, `_${said}_`);
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
    const why = reasonFor(reasons, segment);
    if (why) return why;
  }
  return null;
}
