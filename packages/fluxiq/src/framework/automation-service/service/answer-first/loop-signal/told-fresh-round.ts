// What a fresh round is told was already tried (plan D14, step 3): generic words, read from the
// attempt's record alone. The record holds digests, Core's tool ids, closed codes and an
// amendment's step number and change kind, so nothing here can carry a page's text, a row or a
// word the model wrote. The digests mean nothing to a model and stay out. It says only what did
// not work and how often, and how many fresh starts there have been, so the next way is another.

import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioLlmLoopAttemptRecordData } from "../../../../../runtime/llm/repeat-guard/index.ts";

const RULE = "These were already tried in this task and did not get there. Try another way: another control, another page or another reading of what the page shows.";
/** The newest kept: a model needs the shape of what failed, not a ledger of it. */
const MOST_TOLD = 40;

export function automationStudioAnswerFirstToldTried(data: AutomationStudioLlmLoopAttemptRecordData): JsonObject {
  const unhelpful = data.tried.filter((entry) => entry.outcome !== "applied" || entry.pattern !== undefined).slice(-MOST_TOLD);
  return {
    rule: RULE,
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
