// A step the test passed over, as the judge of a build's test reads it (t193
// 1002-M, live run `run-murzln6g-11debe1d`, C6).
//
// Step 15, the added-to-cart drawer's "×", was an interruption step the Flow
// passes over. It failed because the test only checked the Add to cart before
// it, and the test passed. The judge's `buildTest` listed it `outcome: failed`
// with nothing more, and its second answer asked to "fix or remove the failed
// step 15". The account now says it was excused and why, and the judge is told
// what that means.
import { describe, expect, it } from "vitest";
// The llm barrel first, as `../../../llm/decision-context/tests/recorded-runs.ts` says why.
import "../../../llm/index.ts";
import type { AutomationStudioFlowDraftReplayOutcome } from "../../../flow-draft/index.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed, report, verified, web } from "./draft-steps.ts";

const PICKUP = "Add two packs of the paper towels to my cart.";
const add = web(12, "web.output.dom-click", { selector: "#add", accessibleName: "Add to cart" }, SITE, { step: { acts: ["a1"] } });
const close = web(15, "web.output.dom-click", { selector: "#drawer-close", accessibleName: "×" }, SITE, { step: { interruption: true } });
const plus = web(16, "web.output.dom-click", { selector: "#plus", accessibleName: "+" }, SITE, { step: { acts: ["a1.quantity"] } });
const steps = [navigate(1), add, close, plus];

const failed = (outcome: Partial<AutomationStudioFlowDraftReplayOutcome>): AutomationStudioFlowDraftReplayOutcome => ({
  step: close.position, stepId: close.id!, actionId: close.actionId, status: "failed", resultCode: "core.replay.failed", ...outcome
});

const account = (outcome: AutomationStudioFlowDraftReplayOutcome) => automationStudioBuildTestResultSummary({
  steps, report: report([replayed(steps[0]!), verified(add), outcome, verified(plus)]), nodes: [], instructionText: PICKUP, startLocation: SITE, deniedEvidenceKeys: DENIED
}).buildTest!.steps;

describe("an excused step in the judge's account of a build's test", () => {
  it("run murzln6g: step 15 is marked excused, with why, beside its outcome", () => {
    const line = account(failed({ excused: "interruption" })).find((each) => each.step === 15)!;
    expect(line.outcome).toBe("failed");
    expect(line.excused).toMatch(/^optional/u);
    expect(line.excused).toMatch(/passes over it/u);
    expect(line.excused).toMatch(/did not run/u);
  });

  it("marks a step the test made optional, or the draft says the Flow does not always run, even when the outcome did not say so", () => {
    // A step the replay itself made optional (`madeOptional`) is excused by its new routing.
    const optional = web(15, "web.output.dom-click", { selector: "#drawer-close", accessibleName: "×" }, SITE, { step: { routing: { kind: "optional" } } });
    const lines = automationStudioBuildTestResultSummary({
      steps: [navigate(1), add, optional, plus], report: report([replayed(steps[0]!), verified(add), failed({ status: "unreproducible", resultCode: "core.replay.unreproducible" }), verified(plus)]),
      nodes: [], instructionText: PICKUP, startLocation: SITE, deniedEvidenceKeys: DENIED
    }).buildTest!.steps;
    expect(lines.find((each) => each.step === 15)?.excused).toMatch(/^optional.*target was not there/u);
  });

  it("says a step that needed what a checked step would have done", () => {
    const line = account(failed({ withheldBy: 12, excused: "withheld" })).find((each) => each.step === 15)!;
    expect(line.excused).toContain("step 12");
  });

  it("marks nothing on a step that held, or one that failed and is not excused", () => {
    const held = account(failed({ status: "replayed", resultCode: "core.replay.remembered" }));
    expect(held.find((each) => each.step === 15)).not.toHaveProperty("excused");
    const blocked = automationStudioBuildTestResultSummary({
      steps: [navigate(1), add, web(15, "web.output.dom-click", { selector: "#x", accessibleName: "×" }, SITE), plus],
      report: report([replayed(steps[0]!), verified(add), failed({}), verified(plus)]), nodes: [], instructionText: PICKUP, startLocation: SITE, deniedEvidenceKeys: DENIED
    }).buildTest!.steps;
    expect(blocked.find((each) => each.step === 15)).not.toHaveProperty("excused");
  });

  // What the judge is told an excused step means: `../../../llm/tests/diagnosis-channel.test.ts`.
});
