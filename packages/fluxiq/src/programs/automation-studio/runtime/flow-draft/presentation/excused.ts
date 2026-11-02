import type { AutomationStudioFlowDraftConditionalReason, AutomationStudioFlowDraftReplayOutcome } from "../../../../../runtime/flow-authoring/draft/index.ts";
import type { DraftExcusedFacts } from "../../../../../runtime/flow-authoring/draft/presentation/index.ts";

const WHY: Readonly<Record<AutomationStudioFlowDraftConditionalReason, string>> = {
  interruption: "optional: it answers something not always in front of the page (a dialog, a banner, a panel), so the Flow passes over it when that is not there",
  optional: "optional: the Flow passes over it when it does not work",
  only_if: "conditional: the Flow runs it only when the step it depends on succeeded",
  check: "a check: when it does not hold, the Flow skips the step that depends on it",
  fallback: "a fallback: the Flow runs it only when another step fails",
  // Not "may not run at all", which the chat read as "it only runs sometimes" (U11, `run-muwao5n4-44977b2a`).
  repeat: "repeated: the Flow runs it once per row of what it repeats over, or while a check holds, so it does not run when the test reaches no row"
};

const HERE: Readonly<Record<Exclude<AutomationStudioFlowDraftReplayOutcome["status"], "replayed">, string>> = {
  failed: "in this test it did not run",
  changed: "in this test it produced nothing",
  unreproducible: "in this test its target was not there"
};

export function automationStudioFlowDraftExcusedInstruction(input: DraftExcusedFacts): string {
  const why = input.reason === "withheld" ? `it needed what step ${input.withheldBy ?? "before it"} would have done, and the test only checked that step rather than doing it` : WHY[input.reason];
  return `${why}; ${HERE[input.status]}, which does not stop the Flow.`;
}
