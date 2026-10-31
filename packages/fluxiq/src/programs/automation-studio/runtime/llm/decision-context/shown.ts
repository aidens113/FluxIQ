// What one decision is shown: every evidence entry, and beside them the
// decision history, the draft and the budget.
//
// Order is [...immutable evidence, current view, current Flow, history, draft,
// budget]. Declared view members are references from their first appearance;
// one dynamic current-view tail carries each latest whole group. History,
// draft and budget remain whole. There is no byte allowance to divide between
// them; the harness and provider enforce the model context window loudly.
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
