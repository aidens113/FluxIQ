// What a build's created-audit says it spent, and the two numbers a downstream
// reader holds it to.
//
// These rows exist because a live run was lost to breaking them. Folding the
// build's non-loop provider call -- reading the person's instruction for what
// it asks for -- into `providerCallCount` made every evidence-guided build fail
// the downstream testing facility's bounded contract
// (`packages/test-runner/src/existing-fluxiq-control.ts`, which requires
// `decisionCount === providerCallCount` and `iterationCount` within one of it)
// before its Flow was ever read: `run-mudna2ng-ceadeb69`, `environment.missing`,
// no Flow, nothing measured. The true total is published beside those two, not
// inside them.

import { describe, expect, it } from "vitest";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../../llm/index.ts";
import { evidenceTraceAuditDetail } from "../evidence-trace.ts";

const TRACE: AutomationStudioLlmEvidenceLoopTrace[] = [
  { iteration: 0, decision: "tool_call", callId: "call.0", toolId: "core.run_node", evidenceBytes: 10 },
  { iteration: 1, decision: "tool_call", callId: "call.1", toolId: "core.run_node", evidenceBytes: 20 },
  { iteration: 2, decision: "complete" }
];

describe("what a build's created-audit counts", () => {
  it("keeps the loop's two counts equal, and puts the build's other calls beside them", () => {
    const detail = evidenceTraceAuditDetail(TRACE, 1);

    expect(detail.providerCallCount).toBe(2);
    expect(detail.decisionCount).toBe(2);
    expect(detail.additionalProviderCallCount).toBe(1);
    expect(detail.totalProviderCallCount).toBe(3);
    // The contract a downstream reader holds this to, asserted here so the
    // next person to add a call learns it from a test rather than a live run.
    expect(detail.decisionCount).toBe(detail.providerCallCount);
    expect(detail.iterationCount).toBe(3);
  });

  it("counts no extra calls when the build made none", () => {
    const detail = evidenceTraceAuditDetail(TRACE);

    expect(detail.additionalProviderCallCount).toBe(0);
    expect(detail.totalProviderCallCount).toBe(detail.providerCallCount);
  });

  it("ignores an extra count that is not a whole number of calls", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(evidenceTraceAuditDetail(TRACE, bad).totalProviderCallCount).toBe(2);
    }
  });
});
