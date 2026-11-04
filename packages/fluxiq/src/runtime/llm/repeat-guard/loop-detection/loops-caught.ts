// Loops caught, by pattern, read off what a run already reports: its trace rows,
// which every rebuilder between the loop and a stored run carries, because they
// use the row's own `resultCode` and `resultReason`. A steer's row and a refusal's
// row name the pattern; a refusal of any other reason is the exact-repeat guard's.

import { AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE } from "../feedback.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE } from "./feedback.ts";
import { AUTOMATION_STUDIO_LLM_LOOP_PATTERNS, type AutomationStudioLlmLoopPattern } from "./types.ts";

/** One pattern's count. */
export type AutomationStudioLlmLoopPatternCount = { steered: number; refused: number; changeApproach: number; askPerson: number };

/** What a run reports of its loops. */
export type AutomationStudioLlmLoopsCaught = Record<AutomationStudioLlmLoopPattern, AutomationStudioLlmLoopPatternCount>;

const isPattern = (reason: string | undefined): reason is AutomationStudioLlmLoopPattern => (AUTOMATION_STUDIO_LLM_LOOP_PATTERNS as readonly string[]).includes(reason ?? "");

/** Counts a run's rows, by pattern. */
export function automationStudioLlmLoopsCaught(rows: ReadonlyArray<{ resultCode?: string | undefined; resultReason?: string | undefined }>): AutomationStudioLlmLoopsCaught {
  const caught = Object.fromEntries(AUTOMATION_STUDIO_LLM_LOOP_PATTERNS.map((pattern) => [pattern, { steered: 0, refused: 0, changeApproach: 0, askPerson: 0 }])) as AutomationStudioLlmLoopsCaught;
  for (const { resultCode, resultReason } of rows) {
    const pattern = isPattern(resultReason) ? resultReason : "exact_repeat";
    if (resultCode === AUTOMATION_STUDIO_LLM_EVIDENCE_REPEAT_REFUSED_CODE) caught[pattern].refused += 1;
    else if (resultCode === AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_STEERED_CODE) caught[pattern].steered += 1;
    else if (resultCode === AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.change_approach) caught[pattern].changeApproach += 1;
    else if (resultCode === AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_SIGNAL_CODES.ask_person) caught[pattern].askPerson += 1;
  }
  return caught;
}
