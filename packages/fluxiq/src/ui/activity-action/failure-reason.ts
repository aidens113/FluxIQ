/** A dry run's result codes (`programs/automation-studio/runtime/llm/node-tools/replay.ts`): all but `replayed` mean the step did something else the second time. */
const REPLAY_PREFIX = "core.replay.";
const REPLAYED = "core.replay.replayed";

/**
 * Short reasons, each told by the words a result code ends with. Generic words
 * only; the first that matches decides.
 */
const REASONS: readonly { words: RegExp; why: string }[] = [
  { words: /_(not_found|missing|unobserved|no_match|absent|gone)_/u, why: "it wasn't on the page" },
  { words: /_(timeout|timed_out|too_slow|slow)_/u, why: "the page took too long" },
  { words: /_(ambiguous|multiple_matches|many_matches)_/u, why: "more than one thing on the page matched" },
  { words: /_(not_visible|hidden|obscured|covered|offscreen)_/u, why: "it was hidden on the page" },
  { words: /_(disabled|not_enabled|readonly|read_only)_/u, why: "it couldn't be used yet" },
  { words: /_(detached|stale|changed|moved)_/u, why: "the page changed before it could" },
  { words: /_(intervention|check_required|human_check)_/u, why: "the page wanted a person" },
  { words: /_(denied|forbidden|refused|blocked|not_allowed|permission)_/u, why: "it wasn't allowed" },
  { words: /_(invalid|malformed|rejected|unsupported)_/u, why: "the step wasn't accepted" },
  { words: /_(network|offline|unreachable|navigation_failed|load_failed)_/u, why: "the page didn't load" },
  { words: /_(no_progress|without_progress|repeat)_/u, why: "it made no progress" },
  { words: /_(cancelled|canceled|aborted)_/u, why: "it was stopped" }
];

/**
 * Why an action failed, in a few plain words, read from its result code's last
 * words ("web.target.not_found" -> "it wasn't on the page"). Null when the
 * code names no reason this knows; never the code itself.
 */
export function activityActionFailureReason(resultCode: string): string | null {
  const code = resultCode.trim().toLowerCase();
  if (code.startsWith(REPLAY_PREFIX) && code !== REPLAYED) return "it didn't work the same way again";
  const segments = code.split(".").map((segment) => `_${segment.replace(/[\s-]+/gu, "_")}_`);
  // The last segment first, then each one before it back to the second: the
  // first segment is a namespace, not a reason.
  const ordered = [segments.at(-1) ?? "", ...segments.slice(1, -1).reverse()];
  for (const segment of ordered) {
    const reason = REASONS.find((candidate) => candidate.words.test(segment));
    if (reason) return reason.why;
  }
  return null;
}
