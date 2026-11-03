// The refused steps a no-progress failure carries in the model's words (t378):
// bounded on the way in, read back by the same bounds, and only beside the
// ending they explain.
import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapRefusedSteps as refusedSteps, flowBootstrapEvidenceUnusableDecisionFailure, parseAutomationStudioFlowBootstrapFailureDiagnostic } from "../index.ts";

const progress = { trace: [], accounting: { iterations: 3, toolCalls: 3, evidenceBytes: 10, inputTokens: 0, cacheHitInputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0 }, issueCodes: ["candidate.last_submission_refused:3"] };
const ACCOUNTING = { requestId: "candidate.request", estimatedInputTokens: 10 };

describe("refused steps on a build failure", () => {
  it("keeps placed steps, once per place, at most four, each clipped to one line", () => {
    const long = `keep ${"very ".repeat(40)}close friends`;
    expect(refusedSteps.bounded([
      { step: "keep requests with 5 or more mutual friends", path: "plan.subflows.0.nodes.1.parameters.minimum", code: "bootstrap.unknown_parameter:minimum" },
      { step: "keep requests\nagain", path: "plan.subflows.0.nodes.1.parameters.minimum" },
      { step: "no place at all" },
      { step: "   " , line: 3 },
      { step: "search for\n the towels", line: 32 },
      { step: long, line: 40 },
      { step: "fourth", line: 41 },
      { step: "fifth", line: 42 }
    ])).toEqual([
      { step: "keep requests with 5 or more mutual friends", path: "plan.subflows.0.nodes.1.parameters.minimum", code: "bootstrap.unknown_parameter" },
      { step: "search for the towels", line: 32 },
      { step: long.slice(0, 120), line: 40 },
      { step: "fourth", line: 41 }
    ]);
  });

  it("reads back only what it would have written", () => {
    expect(refusedSteps.parse(undefined)).toBeUndefined();
    expect(refusedSteps.parse([{ step: "keep the close ones", line: 4 }])).toEqual([{ step: "keep the close ones", line: 4 }]);
    for (const bad of [[], [{ step: "x" }], [{ step: "a\nb", line: 1 }], [{ step: "x".repeat(121), line: 1 }], [{ step: "x", line: -1 }], [{ step: "x", path: "has space" }],
      [{ step: "x", line: 1, extra: true }], Array.from({ length: 5 }, (_, line) => ({ step: "x", line }))]) {
      expect(refusedSteps.parse(bad)).toBeNull();
    }
  });

  it("stands beside the no-progress ending, and a diagnostic carrying it anywhere else is not Core's", () => {
    const noProgress = flowBootstrapEvidenceUnusableDecisionFailure(progress, ACCOUNTING, "flow_bootstrap.evidence_repeat_without_progress").diagnostic;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(noProgress)).not.toBeNull();
    const steps = [{ step: "keep the close ones", line: 4, code: "bootstrap.unknown_parameter" }];
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...noProgress, refusedSteps: steps })?.refusedSteps).toEqual(steps);
    const unusable = flowBootstrapEvidenceUnusableDecisionFailure(progress, ACCOUNTING).diagnostic;
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic(unusable)).not.toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...unusable, refusedSteps: steps })).toBeNull();
    expect(parseAutomationStudioFlowBootstrapFailureDiagnostic({ ...noProgress, refusedSteps: [{ step: "x" }] })).toBeNull();
  });
});
