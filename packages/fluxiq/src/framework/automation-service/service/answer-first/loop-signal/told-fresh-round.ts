// What a fresh round is told was already tried (plan D14, step 3): generic words, read from the
// attempt's record alone. The record holds digests, Core's tool ids, closed codes and an
// amendment's step number and change kind, so nothing here can carry a page's text, a row or a
// word the model wrote. The digests mean nothing to a model and stay out. It says only what did
// not work and how often, and how many fresh starts there have been, so the next way is another.
//
// **What the stopped loop repeated** (t962). Where the last round was stopped on a repeat
// (`stoppedOn`), the note names it in Core's words -- the call or the completion, how many times --
// and requires a different approach, so the model is never only told that it was stopped.

import type { JsonObject } from "../../../../../core/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID } from "../../../../../runtime/llm/index.ts";
import { automationStudioLlmLoopRepeatedWords, type AutomationStudioLlmLoopAttemptRecordData, type AutomationStudioLlmLoopStoppedOn } from "../../../../../runtime/llm/repeat-guard/index.ts";

const RULE = "These were already tried in this task and did not get there. Try another way: another control, another page or another reading of what the page shows.";
/** The newest kept: a model needs the shape of what failed, not a ledger of it. */
const MOST_TOLD = 40;
const DIFFERENT = "That way does not work here, so the last round was stopped there. Take a different approach: another control, another page, another reading of what the page shows, or another kind of step.";

export function automationStudioAnswerFirstToldTried(data: AutomationStudioLlmLoopAttemptRecordData): JsonObject {
  const unhelpful = data.tried.filter((entry) => entry.outcome !== "applied" || entry.pattern !== undefined).slice(-MOST_TOLD);
  return {
    rule: RULE,
    ...(data.stoppedOn ? { loopStopped: stoppedWords(data.stoppedOn) } : {}),
    freshStarts: data.approaches,
    tried: unhelpful.map((entry) => ({
      kind: entry.kind,
      toolId: entry.toolId,
      outcome: entry.outcome,
      times: entry.times,
      ...(entry.pattern ? { caughtAs: entry.pattern } : {}),
      ...(entry.changes ? { changes: entry.changes.map((change) => ({ step: change.step, change: change.change })) } : {})
    }))
  };
}

/** What the stopped loop repeated, and the different approach it requires. */
function stoppedWords(stopped: AutomationStudioLlmLoopStoppedOn): JsonObject {
  const repeated = stopped.toolIds.includes(AUTOMATION_STUDIO_LLM_EVIDENCE_COMPLETION_FEEDBACK_TOOL_ID)
    ? `You completed with the same result ${stopped.repeats} times over the same evidence, and the check refused it each time.`
    : automationStudioLlmLoopRepeatedWords(stopped);
  return { pattern: stopped.pattern, repeats: stopped.repeats, toolIds: [...stopped.toolIds], words: `${repeated} ${DIFFERENT}` };
}
