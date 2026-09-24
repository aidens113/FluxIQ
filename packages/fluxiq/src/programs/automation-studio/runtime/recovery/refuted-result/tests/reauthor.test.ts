// Where a wrong answer goes, and every reason it does not go there.
//
// The route exists because the patch ladder could never have helped a Flow
// missing a step, so the assertion that matters most is the negative one: a run
// that failed for anything else, or whose grant does not buy exploring, still
// goes exactly where it went before, and says so on the record.

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY } from "../repair.ts";
import {
  AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY,
  AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE,
  automationStudioReauthorRefutedResult,
  automationStudioRefutedResultFlowWasReauthored,
  automationStudioRefutedResultReauthorDecision,
  automationStudioRefutedResultReauthored
} from "../reauthor.ts";

function detail(code?: string): AutomationStudioFlowRunDetail {
  return {
    summary: { schemaVersion: "0.1", runId: "run.1", flowId: "flow.catalog", status: "failed", startedAt: 1, updatedAt: 2 },
    metadata: code === undefined ? {} : { [AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]: { attempted: true, nodeId: "node.extract", code } }
  } as unknown as AutomationStudioFlowRunDetail;
}

const ROUTABLE = { projectId: "project.demo", flowId: "flow.catalog", grantPurpose: "explore_and_adapt", createAdaptations: true };

describe("whether a refuted run re-enters the build loop", () => {
  it("routes a run refuted for its answer under a grant that buys exploring", () => {
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE }))
      .toEqual({ route: true, projectId: "project.demo", flowId: "flow.catalog" });
  });

  it("leaves every other failure to the ladder it was always handled by", () => {
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE }))
      .toEqual({ route: false, refusal: "not_a_wrong_answer" });
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(), ...ROUTABLE }))
      .toEqual({ route: false, refusal: "not_a_wrong_answer" });
  });

  it("does not route a grant that buys one target override rather than exploring", () => {
    // The widening reverted earlier in this task, refused at the other door too.
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE, grantPurpose: "diagnose_and_adapt" }))
      .toEqual({ route: false, refusal: "grant_does_not_buy_exploration" });
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE, grantPurpose: undefined }))
      .toEqual({ route: false, refusal: "grant_does_not_buy_exploration" });
  });

  it("does not route a run with no Flow to extend, or one that may propose nothing", () => {
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE, flowId: undefined }))
      .toEqual({ route: false, refusal: "flow_unavailable" });
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE, createAdaptations: false }))
      .toEqual({ route: false, refusal: "adaptations_not_permitted" });
  });
});

describe("what the run records about it", () => {
  it("names the adaptation a routed run proposed", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE });
    const recorded = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision, adaptationId: "adaptation.bootstrap.1" });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, adaptationId: "adaptation.bootstrap.1" });
  });

  it("names the code a routed run failed under, so a route that reached nothing is not a silence", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE });
    const recorded = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision, failureCode: "flow_bootstrap.evidence_runtime_unavailable" });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, code: "flow_bootstrap.evidence_runtime_unavailable" });
  });

  it("names why a run was not routed, and keeps everything else the run carried", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE });
    const recorded = automationStudioRefutedResultReauthored({ detail: detail("core.result.verdict_unsure"), decision });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: false, code: "not_a_wrong_answer" });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY]).toBeDefined();
  });
});

// Carrying the re-authoring out: the edit is built, approved and applied,
// because a repair that waits for somebody to press approve is the receipt this
// entry point exists to stop producing.
describe("building the edit and putting it on the Flow", () => {
  const steps = () => {
    const order: string[] = [];
    return {
      order,
      generate: async () => { order.push("generate"); return "adaptation.bootstrap.1"; },
      approve: async (adaptationId: string) => { order.push(`approve:${adaptationId}`); },
      apply: async (adaptationId: string) => { order.push(`apply:${adaptationId}`); },
      failureCode: () => "flow_bootstrap.extend_failed"
    };
  };

  it("builds, approves and applies, in that order, and says the Flow changed", async () => {
    const step = steps();
    await expect(automationStudioReauthorRefutedResult(step)).resolves.toEqual({ adaptationId: "adaptation.bootstrap.1", applied: true });
    expect(step.order).toEqual(["generate", "approve:adaptation.bootstrap.1", "apply:adaptation.bootstrap.1"]);
  });

  it("reports the code a build failed under, and names no adaptation, when nothing was built", async () => {
    const step = steps();
    await expect(automationStudioReauthorRefutedResult({ ...step, generate: async () => { throw new Error("no provider"); }, failureCode: () => "flow_bootstrap.provider_resolution_failed" }))
      .resolves.toEqual({ failureCode: "flow_bootstrap.provider_resolution_failed" });
    expect(step.order).toEqual([]);
  });

  it("keeps the proposal when approval is refused, and does not say the Flow changed", async () => {
    // What a build that had to ask the person a question does: the edit exists
    // and waits for their answer, and nothing is applied behind them.
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, approve: async () => { throw new Error("permission unanswered"); }, failureCode: () => "flow_bootstrap.permission_unanswered" });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failureCode: "flow_bootstrap.permission_unanswered" });
    expect(step.order).toEqual(["generate"]);
    expect(result.applied).toBeUndefined();
  });

  it("keeps the proposal when the apply is refused", async () => {
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, apply: async () => { throw new Error("stale"); } });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failureCode: "flow_bootstrap.extend_failed" });
    expect(step.order).toEqual(["generate", "approve:adaptation.bootstrap.1"]);
  });
});

describe("whether the Flow was actually changed", () => {
  const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

  it("is true only once the edit reached the Flow", () => {
    const applied = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.1", applied: true });
    expect(automationStudioRefutedResultFlowWasReauthored(applied)).toBe(true);
    expect(applied.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, adaptationId: "adaptation.1", applied: true });
  });

  it("is false for an edit that was built and never applied, so nothing re-runs the same Flow", () => {
    const proposed = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.1", failureCode: "flow_bootstrap.permission_unanswered" });
    expect(automationStudioRefutedResultFlowWasReauthored(proposed)).toBe(false);
  });

  it("is false for a run that was never routed", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE });
    expect(automationStudioRefutedResultFlowWasReauthored(automationStudioRefutedResultReauthored({ detail: detail(), decision }))).toBe(false);
  });
});
