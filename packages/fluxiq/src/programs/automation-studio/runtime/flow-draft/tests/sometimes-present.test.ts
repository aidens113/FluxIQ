// Which steps one refused replay proved are only sometimes there.
//
// The shape is t194's run `run-mup2u8o3-6697c4be`: navigate to the store,
// press the cookie banner's Accept, type the search, read the results. The test
// from the start kept the build's consent, so Accept came back unreproducible
// while every step after it replayed, and the Flow was refused for want of
// the word "optional".
import { describe, expect, it } from "vitest";
import {
  automationStudioFlowDraftSometimesPresentStepIds,
  type AutomationStudioFlowDraftDryRun,
  type AutomationStudioFlowDraftReplayOutcome,
  type AutomationStudioFlowDraftStep
} from "../index.ts";

const step = (position: number, over: Partial<AutomationStudioFlowDraftStep> = {}): AutomationStudioFlowDraftStep => ({
  position,
  id: `d${position}`,
  iteration: position,
  actionId: "web.output.dom-click",
  input: { node: "web.output.dom-click", parameters: {} },
  ranWith: { node: "web.output.dom-click", parameters: { target: `#s${position}` } },
  effect: "mutate",
  effectApplied: true,
  disposition: "kept",
  proposes: true,
  ...over
});

const outcome = (position: number, status: AutomationStudioFlowDraftReplayOutcome["status"], over: Partial<AutomationStudioFlowDraftReplayOutcome> = {}): AutomationStudioFlowDraftReplayOutcome => ({
  step: position,
  stepId: `d${position}`,
  actionId: "web.output.dom-click",
  status,
  ...over
});

const verdict = (outcomes: AutomationStudioFlowDraftReplayOutcome[], reset: "ok" | "failed" = "ok"): AutomationStudioFlowDraftDryRun => ({ attempt: 1, reset, outcomes, providerCalls: 0, ok: false });

/** Run 9's draft: navigate, Accept, type, read. The read does the person's one act. */
const RUN_9 = [step(2, { actionId: "web.output.browser-navigate" }), step(3), step(4), step(8, { acts: ["a1"] })];

const ids = (steps: AutomationStudioFlowDraftStep[], outcomes: AutomationStudioFlowDraftReplayOutcome[], reset?: "ok" | "failed") =>
  [...automationStudioFlowDraftSometimesPresentStepIds({ steps, verdict: verdict(outcomes, reset) })];

describe("a step the test from the start found missing and the Flow did not need", () => {
  it("run 9: the cookie Accept, unreproducible with every later step replayed, is only sometimes there", () => {
    expect(ids(RUN_9, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "replayed"), outcome(8, "replayed")])).toEqual(["d3"]);
  });

  it("finds two interruptions in a row, a banner and a popup, when the steps after both replayed", () => {
    const steps = [step(2), step(3), step(4), step(5, { acts: ["a1"] })];
    expect(ids(steps, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "unreproducible"), outcome(5, "replayed")])).toEqual(["d4", "d3"]);
  });

  it("counts a later step the Flow does not always run as one that passed", () => {
    const steps = [step(2), step(3), step(4, { routing: { kind: "optional" } }), step(5)];
    expect(ids(steps, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "failed"), outcome(5, "replayed")])).toEqual(["d3"]);
  });
});

describe("a missing step that is still refused", () => {
  it("does one of the person's acts: optional would let the Flow skip it", () => {
    const steps = [step(2), step(3, { acts: ["a1"] }), step(4)];
    expect(ids(steps, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "replayed")])).toEqual([]);
  });

  it("has a step after it that did not replay: the draft may have lost its way", () => {
    for (const later of ["failed", "changed", "unreproducible"] as const) {
      const steps = [step(2), step(3), step(4, later === "unreproducible" ? { acts: ["a1"] } : {}), step(5)];
      expect(ids(steps, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, later), outcome(5, "replayed")]), later).toEqual([]);
    }
  });

  it("is the last step: nothing after it was run, so nothing proved it unneeded", () => {
    expect(ids([step(2), step(3)], [outcome(2, "replayed"), outcome(3, "unreproducible")])).toEqual([]);
  });

  it("did not replay for another reason: it failed or changed", () => {
    for (const status of ["failed", "changed"] as const) {
      expect(ids(RUN_9, [outcome(2, "replayed"), outcome(3, status), outcome(4, "replayed"), outcome(8, "replayed")]), status).toEqual([]);
    }
  });

  it("was only checked, not run again, because its effect lasts", () => {
    expect(ids(RUN_9, [outcome(2, "replayed"), outcome(3, "unreproducible", { mode: "verify" }), outcome(4, "replayed"), outcome(8, "replayed")])).toEqual([]);
  });

  it("already says when it runs", () => {
    const steps = [step(2), step(3, { routing: { kind: "only_if", check: "d2" } }), step(4)];
    expect(ids(steps, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "replayed")])).toEqual([]);
  });

  it("was in a replay whose reset failed", () => {
    expect(ids(RUN_9, [outcome(2, "replayed"), outcome(3, "unreproducible"), outcome(4, "replayed"), outcome(8, "replayed")], "failed")).toEqual([]);
  });
});
