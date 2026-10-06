import type { ActivityActionKind } from "./types.ts";

/** A replay's result codes (`programs/automation-studio/runtime/llm/node-tools/replay.ts`). */
const VERIFIED = "core.replay.verified";
const ALREADY_DONE: ReadonlySet<string> = new Set(["core.replay.present", "core.replay.remembered"]);

/**
 * Why a test passes over a step that did not hold, as the activity record
 * names it (`Excused: <reason>`, `programs/automation-studio/runtime/activity/observer.ts`;
 * the reasons are the dry run's, `programs/automation-studio/runtime/flow-draft/excused.ts`).
 */
const OPTIONAL: ReadonlySet<string> = new Set(["interruption", "optional"]);
const SOMETIMES: ReadonlySet<string> = new Set(["only_if", "check", "fallback"]);

/**
 * What a test of the Flow did with one step, when it did not simply do it
 * again, in the words a card shows in place of "Done", or null for a step done
 * again (`core.replay.replayed`), a step that did not hold and is not excused,
 * and every code that is not a replay's.
 *
 * - `verified`: "Checked, not pressed" ("not typed" for a typing step): the
 *   step does something lasting, so the test only checked it could.
 * - `present`, `remembered`: "Already done on the site": its effect was in
 *   place, or the site remembered it, so there was nothing to do.
 * - a step that did not hold and that the Flow passes over (`excused`):
 *   "Skipped: not there, optional" for an optional or interruption step,
 *   "Skipped: it only runs sometimes" for a conditional or fallback one,
 *   "Skipped: the test reached no rows for it to repeat over" for a repeated
 *   one, and "Skipped: it needed a step the test only checked" for one that
 *   needed what a checked step would have done. A repeat runs once per row,
 *   not sometimes: run `run-muwao5n4-44977b2a` (U11) called the repeated
 *   Confirm "it only runs sometimes" when the list it repeats over never
 *   appeared in the test.
 *
 * Read by Core's activity rows (their status sentence) and by every client's
 * cards, so the overlay and the card say one thing. Before it, all of these
 * read "Done", and an excused step "Didn't work: it didn't work the same way
 * again" (t193 1002-M, `run-murzln6g-11debe1d`, C10).
 */
export function activityActionTested(resultCode: string, context: { excused?: string | undefined; kind?: ActivityActionKind | undefined } = {}): string | null {
  const code = resultCode.trim().toLowerCase();
  if (code === VERIFIED) return context.kind === "type" ? "Checked, not typed" : "Checked, not pressed";
  if (ALREADY_DONE.has(code)) return "Already done on the site";
  const excused = context.excused?.trim().toLowerCase();
  if (!excused || !code.startsWith("core.replay.") || code === "core.replay.replayed") return null;
  if (OPTIONAL.has(excused)) return "Skipped: not there, optional";
  if (SOMETIMES.has(excused)) return "Skipped: it only runs sometimes";
  if (excused === "repeat") return "Skipped: the test reached no rows for it to repeat over";
  if (excused === "withheld") return "Skipped: it needed a step the test only checked";
  return null;
}
