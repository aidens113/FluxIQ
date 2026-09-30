// What one decision is shown: every evidence entry, and beside them the
// decision history, the draft and the budget.
//
// Order is `[...evidence, history, draft, budget]`: what happened, then the
// record of every decision, then the plan it has come to, and last what is
// left to spend. Every entry is shown whole: the history in its full form and
// the draft with every step and every argument. There is no byte allowance to
// divide between them; the only bound on the request is the model's context
// window, which the harness and the provider enforce loudly
// (`../context-window.ts`).
//
// The draft is measured as it goes out (`../evidence-loop/draft-shown.ts`),
// so a run's record says what the model was shown of its own draft.

import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { automationStudioLlmEvidenceLoopDraftShown, type AutomationStudioLlmEvidenceLoopDraftShown } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmDecisionContextRecord } from "./decision.ts";
import { automationStudioLlmDecisionContextEntry } from "./entry.ts";

/**
 * What one decision is shown, and what it was shown of the draft.
 *
 * `draft` is absent when the loop keeps no draft to show.
 */
export function automationStudioLlmDecisionContextShown(input: {
  evidence: readonly AutomationStudioLlmEvidenceEntry[];
  records: readonly AutomationStudioLlmDecisionContextRecord[];
  draft?: { steps: readonly AutomationStudioFlowDraftStep[] } | undefined;
  budgetEntry?: AutomationStudioLlmEvidenceEntry | undefined;
}): { shown: AutomationStudioLlmEvidenceEntry[]; draftShown?: AutomationStudioLlmEvidenceLoopDraftShown } {
  const historyEntry = automationStudioLlmDecisionContextEntry({ records: input.records });
  const draftEntry = input.draft ? automationStudioFlowDraftEntry({ steps: input.draft.steps }) : undefined;
  const draftShown = draftEntry ? automationStudioLlmEvidenceLoopDraftShown({ value: draftEntry.value }) : undefined;
  const beside = [historyEntry, draftEntry, input.budgetEntry].filter((entry) => entry !== undefined);
  return { shown: [...automationStudioLlmEvidenceContextWindow(input.evidence), ...beside], ...(draftShown ? { draftShown } : {}) };
}
