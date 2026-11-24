// What a fresh round starts with of everything the attempt's earlier rounds did and found (t1014).
//
// **Why.** A round's evidence window is its own: when a round ends (loop detection's last rung, the completion check's
// ladder, a stall, a throw) the next one used to start from an empty window, told only what was tried in counts and
// codes (`../attempt/round-note.ts`). The model then looked again at what it had already read, described and found, and did it
// again (user, 2026-11-24: "THERE SHOULDNT BE ANY ARBITRARY FUCKING CALL LIMIT THAT RANDOMLY JUST RESETS EVERYTHING").
// A new round may reframe the conversation, but now it starts with what the run learned: every call the attempt made
// before it, from the attempt's trail (`../trail/`), in order, each with what it was asked, how it came back, where it
// was and what it found (`./carried-step.ts`). The round's note still says what was tried, what the loop stopped on and
// what the check said; this is the evidence beside it.
//
// **Compact, and within the window.** No page view is carried (the round's opening look shows the page as it stands),
// and where the calls still do not fit their share of the model's window the oldest are summarised in counts, never
// dropped (`./fitted.ts`): a summarised call still says it ran and how it ended. The share is a quarter of the window's
// input, measured at the judge's conservative bytes per token (`runtime/result-verification/run-trail/window.ts`), so the
// round's own evidence always has the rest.
//
// **Constant for the round.** Built once, as the round starts, and shown right after its note, so every request of the
// round stays a byte prefix of the next. A page's words in it are evidence, as in any call's result, under Core's id.

import type { JsonObject } from "../../../../../core/index.ts";
import { resolveAutomationStudioLlmTokenLimits, type AutomationStudioLlmTokenLimits } from "../../../../../runtime/models/limits/index.ts";
import type { AutomationStudioResultTrailStep } from "../../../../../runtime/result-verification/index.ts";
import { automationStudioAnswerFirstCarriedStep } from "./carried-step.ts";
import { automationStudioAnswerFirstEarlierFitted } from "./fitted.ts";
import { AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID } from "./tool-id.ts";

/** Below the densest request measured (2.02 bytes a token, run-mwodpw10-3d5748ab), as the judge's window measure is. */
const BYTES_PER_TOKEN = 1.8;
/** The earlier rounds' share of the window's input: the round's own evidence has the rest. */
const WINDOW_SHARE = 0.25;

const WORDS = "What this attempt did in its earlier rounds, oldest first: each call (did, asked), how it came back (outcome), where it was (where) and what it found (found). "
  + "This round starts afresh from the page as it stands, and all of this still holds as what was seen then: use it, and do not look again for what is here unless the page has changed. "
  + "The page each call saw is not repeated (core.view_not_carried): this round's own look shows the page as it is now. "
  + "A handle from an earlier round names a control only while its page stands, so check it on the page now before you act on it.";

const SUMMARISED_WORDS = "So that all of it fits, what the oldest calls found, and then what they were asked, is summarised in counts in its own place (core.summarised). Every call is still listed with its outcome: nothing was left out.";

/** The entry a fresh round is shown after its note; nothing where no call came before it. */
export function automationStudioAnswerFirstEarlierRounds(input: {
  trail: readonly AutomationStudioResultTrailStep[];
  observedStateKeys?: readonly string[] | undefined;
  deniedEvidenceKeys: readonly string[];
  tokenLimits?: Partial<AutomationStudioLlmTokenLimits> | undefined;
}): { callId: string; toolId: string; value: JsonObject } | undefined {
  const options = { observedStateKeys: input.observedStateKeys ?? [], deniedEvidenceKeys: input.deniedEvidenceKeys };
  const carried = input.trail.flatMap((step, index): JsonObject[] => {
    const shown = automationStudioAnswerFirstCarriedStep(step, index + 1, options);
    return shown ? [shown] : [];
  });
  if (carried.length === 0) return undefined;
  const { limits } = resolveAutomationStudioLlmTokenLimits(input.tokenLimits);
  const { entries, summarised } = automationStudioAnswerFirstEarlierFitted(carried, Math.floor(limits.maxInputTokens * WINDOW_SHARE * BYTES_PER_TOKEN));
  return {
    callId: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID,
    toolId: AUTOMATION_STUDIO_ANSWER_FIRST_EARLIER_ROUNDS_TOOL_ID,
    value: { words: WORDS, calls: entries, ...(summarised > 0 ? { summarised: { count: summarised, words: SUMMARISED_WORDS } } : {}) }
  };
}
