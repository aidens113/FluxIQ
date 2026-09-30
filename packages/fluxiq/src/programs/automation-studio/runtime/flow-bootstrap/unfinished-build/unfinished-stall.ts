// How a round whose decisions kept coming back unusable reaches the build
// with its draft.
//
// The loop ends that way through its caller's `stalled` hook, and throws what
// the hook returns (`../../llm/loop-configuration.ts`, `unusableDecisions`).
// Before t208 the hook built the build's failure there and then, and the build
// ended `flow_bootstrap.evidence_unusable_decision` with its draft dropped --
// 16 of the 57 no-Flow builds of 2026-09-29/30 (audit A1). This is what the
// hook returns instead: the stall and the draft as it stood, which the build
// catches, tests, judges and repairs (`./phases.ts`).
import type { AutomationStudioFlowDraftStep } from "../../flow-draft/index.ts";
import type { AutomationStudioLlmEvidenceLoopAccounting, AutomationStudioLlmEvidenceLoopTrace } from "../../llm/index.ts";

export class AutomationStudioFlowBootstrapUnfinishedStall extends Error {
  readonly name = "AutomationStudioFlowBootstrapUnfinishedStall";

  constructor(readonly progress: {
    issueCodes: readonly string[];
    trace: readonly AutomationStudioLlmEvidenceLoopTrace[];
    accounting: Readonly<AutomationStudioLlmEvidenceLoopAccounting>;
    steps: readonly AutomationStudioFlowDraftStep[];
  }) {
    super("The round's decisions kept coming back unusable; its draft goes to the test.");
  }
}
