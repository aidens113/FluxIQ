// What a budget ending says was kept, and how much it says worked (t193 R2-C3,
// live run `run-murzln6g-11debe1d`): "The Flow so far was kept" beside a Flow
// the chat then called empty, and "5 of the 6 things you asked worked" right
// before "what it did was judged not to be what you asked".
import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowBootstrapJudgement } from "../contracts.ts";
import { automationStudioFlowBootstrapBudgetExhausted } from "../budget-exhausted.ts";

const checklist = [
  { id: "a1", verb: "switch", quote: "switch my pickup store", done: 1 },
  { id: "a2", verb: "add", quote: "add two packs", done: 3 }
];

const judgedNo: AutomationStudioFlowBootstrapJudgement = {
  round: 1, stopped: "judged_wrong", tested: "replayed_clean", testIssueCodes: [], failedSteps: [], stepsInFlow: 13, done: 2, proven: 2, todo: [], lastIssueCodes: [],
  judge: { verdict: "no", findings: ["the cart holds one pack"], observed: "the cart holds one pack" }
};

const told = { bound: "cost" as const, sizes: { maxCostUsd: 0.1 }, judgement: judgedNo, checklist, rounds: 1, decisions: 30, spending: { spentUsd: 0.089, pendingUsd: 0, ceilingUsd: 0.1 } };

describe("a budget ending", () => {
  it("says the steps found so far were kept as a draft, never that the Flow is empty", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: true }).message;
    expect(message).toContain("The steps I found so far were kept as a draft, so building again carries on from them, with $0.011 left of this Flow's $0.10.");
    expect(message).not.toContain("empty");
  });

  it("says nothing was kept when nothing was", () => {
    expect(automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: false }).message).toContain("Nothing was kept to carry on from.");
  });

  it("never says worked of a Flow judged not to do what was asked", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, kept: true }).message;
    // "I worked on it live" is what was tried, said of the build, not of what the Flow does.
    expect(message.replace("I worked on it live", "")).not.toContain("worked");
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (13 steps) was run from its start, but the Flow was judged not to do what you asked.");
    expect(message.match(/not to do what you asked|not to be what you asked/gu)).toHaveLength(1);
  });
});

// t193 round 1003 (w9, w6): the merged progress-and-test sentence, and a split
// judge said as what it means in a build, never "the run is not marked as failed".
describe("a budget ending after a judge that did not settle it", () => {
  const disagreed = "This result was checked twice with the same evidence, and the answers differed. Neither answer counts for more than the other, so the result is not confirmed, and the run is not marked as failed for it.";
  const unsure: AutomationStudioFlowBootstrapJudgement = { ...judgedNo, stopped: "budget", judge: { verdict: "unknown", findings: [disagreed] } };

  it("says not judged once, with the step count in the progress sentence", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, judgement: unsure, spending: { ...told.spending, judgedUsd: 0.01 }, kept: true }).message;
    expect(message).toContain("2 of the 2 things you asked have a step that ran, or could run, when the Flow (13 steps) was run from its start, but the Flow was not judged to do what you asked.");
    expect(message).not.toContain("what it did was not judged");
  });

  it("says the build cannot finish on the split, never that the run is not failed", () => {
    const message = automationStudioFlowBootstrapBudgetExhausted({ ...told, judgement: unsure, spending: { ...told.spending, judgedUsd: 0.01 }, kept: true }).message;
    expect(message).toContain("The judge could not confirm it: This result was checked twice with the same evidence, and the answers differed. Since they disagree, the build cannot finish on this test.");
    expect(message).not.toContain("not marked as failed");
  });
});
