// The inputs a build's test ran on, as its judge is shown them once beside the
// steps (t252 D4): the Flow's parameters at their test values, screened.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../../core/index.ts";
import type { AutomationStudioFlowDraftStep } from "../../../flow-draft/index.ts";
import { automationStudioBuildTestResultSummary } from "../summary.ts";
import { DENIED, SITE, navigate, replayed } from "./draft-steps.ts";

function step(position: number, parameters: JsonObject): AutomationStudioFlowDraftStep {
  return {
    position, id: `d${position}`, iteration: position, actionId: "node.search",
    input: { node: "node.search", parameters }, ranWith: { node: "node.search", parameters },
    effect: "mutate", effectApplied: true, proposes: true, disposition: "kept", replay: { from: { location: SITE } }
  };
}

const start = navigate(1);

function judged(steps: AutomationStudioFlowDraftStep[]) {
  return automationStudioBuildTestResultSummary({
    steps, report: { verdict: { outcomes: steps.map(replayed) }, observations: [], reused: false }, nodes: [], startLocation: SITE, deniedEvidenceKeys: DENIED
  });
}

describe("the inputs the test ran on", () => {
  const query = (test: unknown) => ({ $state: { path: "query", fallback: test } }) as JsonObject;

  it("appear once, beside the steps, at their test values with the steps using them", () => {
    const summary = judged([start, step(2, { text: query("blue towels") })]);
    expect(summary.buildTest?.inputs).toEqual([{ name: "query", test: "blue towels", steps: [2] }]);
    expect(summary.withheld).toBe(false);
  });

  it("say a credential-shaped test value as withheld", () => {
    const summary = judged([start, step(2, { text: query("sk-live-4f9a8b7c6d5e4f3a2b1c0d9e8f7a6b5c") })]);
    expect(summary.buildTest?.inputs).toEqual([{ name: "query", test: "(withheld)", steps: [2] }]);
    expect(summary.withheld).toBe(true);
  });

  it("are absent when the Flow takes none", () => {
    expect(judged([start, step(2, { text: "blue towels" })]).buildTest?.inputs).toBeUndefined();
  });
});
