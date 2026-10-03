// The judgement a repair's first decision reads, whole. The user's order,
// 2026-09-30: "Remove ANY AND ALL LIMITS ON THE NUMBER OF ELEMENTS PASSED TO
// MODEL. DO NOT HIDE INFORMATION." Until then the codes and the acts still to do
// stopped at sixteen each.
import { describe, expect, it } from "vitest";
import { automationStudioFlowBootstrapJudgeFinished, automationStudioFlowBootstrapJudgementValue } from "../judgement.ts";

describe("the judgement a repair reads", () => {
  it("carries every act still to do and every code, not the first sixteen", () => {
    const todo = Array.from({ length: 40 }, (_unused, index) => `a${index + 1}`);
    const codes = Array.from({ length: 30 }, (_unused, index) => `bootstrap.code_${index}`);
    const value = automationStudioFlowBootstrapJudgementValue({
      round: 1,
      stopped: "iterations",
      tested: "replay_failed",
      testIssueCodes: codes,
      failedSteps: [2, 3],
      stepsInFlow: 5,
      done: 1,
      todo,
      lastIssueCodes: codes
    });
    expect(value.actsTodo).toEqual(todo);
    expect(value.testIssueCodes).toEqual(codes);
    expect(value.lastRefusedFor).toEqual(codes);
  });
});

// Live run murwcmx2 (step 0035): the judge's first call said the read's name
// condition was over-broad, the second did not confirm it, and the repair was
// told only "unknown" with Core's sentence. The reading travels on the unknown,
// apart from a no's own fields, so the repair can tell one unconfirmed reading
// from a refutation.
describe("an unknown verdict's unconfirmed reading", () => {
  const SPEND = { inputTokens: 1, outputTokens: 1, totalTokens: 2, estimatedCostUsd: 0.001 };
  const reading = { expected: "Every pair under $50.", observed: "The name condition left out earbuds with a charging case.", advice: "Narrow the name condition to accessory-only titles." };

  it("reaches the repair's judgement as judge.unconfirmedReading, and never as a no's expected, observed or advice", () => {
    const { judgement } = automationStudioFlowBootstrapJudgeFinished({
      round: 0, steps: [], checklist: () => undefined,
      verdict: { verdict: "unknown", why: "Asked twice, the model never judged it twice.", unconfirmedReading: reading, spent: SPEND }
    });
    expect(judgement.judge).toEqual({ verdict: "unknown", findings: ["Asked twice, the model never judged it twice."], unconfirmedReading: reading });
    const value = automationStudioFlowBootstrapJudgementValue(judgement);
    expect(value.judge).toEqual({ verdict: "unknown", findings: ["Asked twice, the model never judged it twice."], unconfirmedReading: reading });
  });

  it("is absent where the verdict carried none, or carried an empty one", () => {
    for (const unconfirmedReading of [undefined, {}]) {
      const { judgement } = automationStudioFlowBootstrapJudgeFinished({
        round: 0, steps: [], checklist: () => undefined,
        verdict: { verdict: "unknown", why: "unsure", ...(unconfirmedReading ? { unconfirmedReading } : {}), spent: SPEND }
      });
      expect(judgement.judge).not.toHaveProperty("unconfirmedReading");
      expect(automationStudioFlowBootstrapJudgementValue(judgement).judge).not.toHaveProperty("unconfirmedReading");
    }
  });
});
