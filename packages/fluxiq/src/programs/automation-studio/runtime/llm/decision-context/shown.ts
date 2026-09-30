// What one decision is shown: the window of evidence, and beside it the
// decision history, the draft and the budget.
//
// The three beside entries sit outside the window for one reason: the window
// keeps whole entries newest first, and anything that must be in front of the
// model every decision cannot compete for that room. The draft learnt this when
// every action of one kind arrived under one tool id and a live build lost four
// of five presses; the history exists because Core's answers to the model's
// decisions left the window with no trace at all (`./decision.ts`).
//
// Order is `[...window, history, draft, budget]`: what happened, then the record
// of every decision, then the plan it has come to, and last what is left to
// spend. Each beside entry's bytes, plus its separator, come off the window's
// allowance before the window is chosen, so the whole request stays inside
// `maxEvidenceContextBytes` however long the build runs.
//
// The draft is measured as it goes out (`../evidence-loop/draft-shown.ts`),
// because nothing downstream can work out afterwards what the model saw: the
// entry shrinks itself to fit -- its arguments, then the length of its
// guidance, then the oldest steps -- and a run could not answer "was the model
// shown its whole draft?" without rebuilding the steps by hand.

import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS } from "../../loop-limits/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { automationStudioLlmEvidenceLoopDraftShown, type AutomationStudioLlmEvidenceLoopDraftShown } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { automationStudioLlmDecisionContextEntry } from "./entry.ts";

/**
 * What one decision is shown, and what it was shown of the draft.
 *
 * `draft` is absent when the loop keeps no draft to show. The history's cap is
 * a sixth of the context, at most 4,000 bytes -- the draft's own ceiling -- so
 * a small context is not spent on the record of how it was spent.
 */
export function automationStudioLlmDecisionContextShown(input: {
  evidence: readonly AutomationStudioLlmEvidenceEntry[];
  records: readonly AutomationStudioLlmDecisionContextRecord[];
  draft?: { steps: readonly AutomationStudioFlowDraftStep[]; maxBytes: number; minBytes: number } | undefined;
  budgetEntry?: AutomationStudioLlmEvidenceEntry | undefined;
  maxEvidenceContextBytes: number;
}): { shown: AutomationStudioLlmEvidenceEntry[]; draftShown?: AutomationStudioLlmEvidenceLoopDraftShown } {
  const historyEntry = automationStudioLlmDecisionContextEntry({ records: input.records, maxBytes: Math.min(4_000, Math.floor(input.maxEvidenceContextBytes / 6)) });
  const draftEntry = input.draft ? automationStudioFlowDraftEntry({ steps: input.draft.steps, maxBytes: input.draft.maxBytes }) : undefined;
  const draftShown = draftEntry && input.draft
    ? automationStudioLlmEvidenceLoopDraftShown({ value: draftEntry.value, budget: input.draft.maxBytes, minBytes: input.draft.minBytes })
    : undefined;
  const beside = [historyEntry, draftEntry, input.budgetEntry].filter((entry) => entry !== undefined);
  const besideBytes = beside.reduce((total, entry) => total + Buffer.byteLength(JSON.stringify(entry), "utf8") + 1, 0);
  const window = automationStudioLlmEvidenceContextWindow(input.evidence, input.maxEvidenceContextBytes - besideBytes, AUTOMATION_STUDIO_LLM_EVIDENCE_LOOP_LIMITS.maxToolCalls - beside.length);
  return { shown: [...window, ...beside], ...(draftShown ? { draftShown } : {}) };
}
