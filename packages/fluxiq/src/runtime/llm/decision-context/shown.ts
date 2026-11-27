// What one decision is shown: every evidence entry, and beside them the
// decision history, the draft and the budget.
//
// Order is [...immutable evidence, page window, current view, current Flow,
// history, draft, budget]. Declared view members are references from their
// first appearance; one dynamic current-view tail carries each latest whole group. History,
// draft and budget remain whole. There is no byte allowance to divide between
// them; the harness and provider enforce the model context window loudly.
//
// **Cache order (page-diff D8).** The request's head -- system text, the tool
// list, the task and the draft's guidance -- never changes mid-run. After it
// comes the append-only history of results, each carrying a fixed note of its
// page delivery when a page channel is declared, and last the entries rewritten
// for every decision, the deliveries' own `core.page_window` first
// (`../evidence-moves/evidence-that-moves.ts`; `../view-channel/projection.ts`,
// t1080). The draft entry stays among
// those last ones, after the history, not before it: in the five t1015 bigbox
// recordings it read differently from one decision to the next in 296 of 462
// consecutive pairs, because it lists every step that ran, so placed first it
// would have sent every one of those requests' history uncached (measured for
// t1036). Should the draft stop changing with every call, it can move into
// the head, and must then leave the moving list, or nothing after it is cached.
//
// The draft is measured as it goes out (`../evidence-loop/draft-shown.ts`),
// so a run's record says what the model was shown of its own draft.

import type { JsonValue } from "../../../core/index.ts";
import { automationStudioFlowDraftEntry, type AutomationStudioFlowDraftRoute, type AutomationStudioFlowDraftStep } from "../../flow-authoring/draft/index.ts";
import { automationStudioLlmEvidenceContextWindow, type AutomationStudioLlmEvidenceEntry } from "../context-window.ts";
import { automationStudioLlmEvidenceLoopDraftShown, type AutomationStudioLlmEvidenceLoopDraftShown } from "../evidence-loop/index.ts";
import type { AutomationStudioLlmPageChannel } from "../view-channel/index.ts";
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
  draft?: { steps: readonly AutomationStudioFlowDraftStep[]; acts?: JsonValue | undefined; route?: AutomationStudioFlowDraftRoute | undefined } | undefined;
  budgetEntry?: AutomationStudioLlmEvidenceEntry | undefined;
  /** The keys of a result that are a view of the target, as the domain declared them (`../context-window.ts`). */
  observedStateKeys?: readonly string[] | undefined;
  /** The domain's page channel, when the loop was given one: each result's page shown in place, whole once and as changes after (`../view-channel/`). */
  pageChannel?: AutomationStudioLlmPageChannel | undefined;
}): { shown: AutomationStudioLlmEvidenceEntry[]; draftShown?: AutomationStudioLlmEvidenceLoopDraftShown } {
  const historyEntry = automationStudioLlmDecisionContextEntry({ records: input.records });
  const draftEntry = input.draft ? automationStudioFlowDraftEntry({ steps: input.draft.steps, acts: input.draft.acts, route: input.draft.route }) : undefined;
  const draftShown = draftEntry ? automationStudioLlmEvidenceLoopDraftShown({ value: draftEntry.value }) : undefined;
  const beside = [historyEntry, draftEntry, input.budgetEntry].filter((entry) => entry !== undefined);
  return { shown: [...automationStudioLlmEvidenceContextWindow(input.evidence, input.observedStateKeys, input.pageChannel), ...beside], ...(draftShown ? { draftShown } : {}) };
}
