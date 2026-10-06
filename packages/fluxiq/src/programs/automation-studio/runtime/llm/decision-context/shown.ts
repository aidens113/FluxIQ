// What one decision is shown: every evidence entry, and beside them the
// decision history, the draft and the budget.
//
// Order is `[...evidence, history, draft, budget]`: what happened, then the
// record of every decision, then the plan it has come to, and last what is
// left to spend. Every entry is shown whole: the history in its full form and
// the draft with every step and every argument, and every result -- save that
// a view of the target a newer view replaced is shown as a reference to it
// (`../context-window.ts`). There is no byte allowance to divide between them;
// the only bound on the request is the model's context window, which the
// harness and the provider enforce loudly.
//
// The draft is measured as it goes out (`../evidence-loop/draft-shown.ts`),
// so a run's record says what the model was shown of its own draft.

import type { JsonValue } from "../../../../../core/index.ts";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftRoute, type AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
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
  draft?: { steps: readonly AutomationStudioFlowDraftStep[]; authored?: boolean | undefined; acts?: JsonValue | undefined; route?: AutomationStudioFlowDraftRoute | undefined } | undefined;
  budgetEntry?: AutomationStudioLlmEvidenceEntry | undefined;
  /** The keys of a result that are a view of the target, as the domain declared them (`../context-window.ts`). */
  observedStateKeys?: readonly string[] | undefined;
}): { shown: AutomationStudioLlmEvidenceEntry[]; draftShown?: AutomationStudioLlmEvidenceLoopDraftShown } {
  const historyEntry = automationStudioLlmDecisionContextEntry({ records: input.records });
  const draftEntry = input.draft ? automationStudioFlowDraftEntry({ steps: input.draft.steps, authored: input.draft.authored, acts: input.draft.acts, route: input.draft.route }) : undefined;
  const draftShown = draftEntry ? automationStudioLlmEvidenceLoopDraftShown({ value: draftEntry.value }) : undefined;
  const beside = [historyEntry, draftEntry, input.budgetEntry].filter((entry) => entry !== undefined);
  return { shown: [...automationStudioLlmEvidenceContextWindow(input.evidence, input.observedStateKeys), ...beside], ...(draftShown ? { draftShown } : {}) };
}
