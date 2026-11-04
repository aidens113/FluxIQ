// How many loops an attempt's detector caught, by pattern (plan, D14), so the count
// can be seen falling over time.
//
// **Aligned with the Loop Detection lane.** The patterns and the four counts are
// `AUTOMATION_STUDIO_LLM_LOOP_PATTERNS` and `AutomationStudioLlmLoopsCaught` in
// `runtime/llm/repeat-guard/loop-detection/`, which a contract cannot import
// because they live in the runtime. That lane reports every pattern, so all of them
// are required here.

import { hasOnlyKeys, isCount, isPlainRecord } from "./field-checks.ts";

export const AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS = Object.freeze(["exact_repeat", "near_repeat", "cycle", "no_progress", "same_fix"] as const);

export type AutomationStudioTaskAttemptLoopPattern = (typeof AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS)[number];

/** One pattern's count at each step of the ladder that ran. */
export type AutomationStudioTaskAttemptLoopCount = { steered: number; refused: number; changeApproach: number; askPerson: number };

export type AutomationStudioTaskAttemptLoopsCaught = Record<AutomationStudioTaskAttemptLoopPattern, AutomationStudioTaskAttemptLoopCount>;

const COUNT_KEYS: ReadonlySet<string> = new Set(["steered", "refused", "changeApproach", "askPerson"]);
const PATTERN_KEYS: ReadonlySet<string> = new Set(AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS);

/** An attempt that has caught nothing yet. */
export function automationStudioTaskAttemptNoLoopsCaught(): AutomationStudioTaskAttemptLoopsCaught {
  return {
    exact_repeat: noCount(),
    near_repeat: noCount(),
    cycle: noCount(),
    no_progress: noCount(),
    same_fix: noCount()
  };
}

/** A fresh copy of the counts, or null when a pattern is unknown or missing or a count is not a whole number. */
export function readAutomationStudioTaskAttemptLoopsCaught(value: unknown): AutomationStudioTaskAttemptLoopsCaught | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, PATTERN_KEYS)) return null;
  const caught = automationStudioTaskAttemptNoLoopsCaught();
  for (const pattern of AUTOMATION_STUDIO_TASK_ATTEMPT_LOOP_PATTERNS) {
    const count = readCount(value[pattern]);
    if (count === null) return null;
    caught[pattern] = count;
  }
  return caught;
}

function noCount(): AutomationStudioTaskAttemptLoopCount {
  return { steered: 0, refused: 0, changeApproach: 0, askPerson: 0 };
}

function readCount(value: unknown): AutomationStudioTaskAttemptLoopCount | null {
  if (!isPlainRecord(value) || !hasOnlyKeys(value, COUNT_KEYS)) return null;
  const { steered, refused, changeApproach, askPerson } = value;
  if (!isCount(steered) || !isCount(refused) || !isCount(changeApproach) || !isCount(askPerson)) return null;
  return { steered, refused, changeApproach, askPerson };
}
