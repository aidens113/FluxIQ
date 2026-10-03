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
 */
const REFUSAL_REASONS: readonly { words: RegExp; why: string }[] = [
  { words: /_(not_a_handle|malformed_handle|handle_in_wrong_parameter)_/u, why: "it didn't name a control from the page" },
  { words: /_(no_longer_on_page)_/u, why: "it was no longer on the page" },
  // Before `REASONS`, whose `changed` would say the opposite of "nothing changed".
  { words: /_(nothing_changed|unchanged)_/u, why: "nothing on the page changed" }
];

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
  if (activityActionReplayFailing(code)) return "it didn't work the same way again";
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
