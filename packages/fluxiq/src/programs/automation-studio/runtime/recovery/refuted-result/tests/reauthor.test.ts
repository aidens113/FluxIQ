// Where a wrong answer goes, and every reason it does not go there.
//
// The route exists because the patch ladder could never have helped a Flow
// missing a step, so the assertion that matters most is the negative one: a run
// that failed for anything else still goes exactly where it went before, and
// says so on the record.
//
// What used to be asserted here, and is now asserted the other way round, is
// that a grant's purpose and a training setting could close the route. Both
// were permission questions asked about repairing a Flow, which is not a risky
// act, and both are gone (t166).

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

const ROUTABLE = { projectId: "project.demo", flowId: "flow.catalog" };

describe("whether a refuted run re-enters the build loop", () => {
  it("routes a run refuted for its answer", () => {
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE }))
      .toEqual({ route: true, projectId: "project.demo", flowId: "flow.catalog" });
  });

  it("leaves every other failure to the ladder it was always handled by", () => {
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE }))
      .toEqual({ route: false, refusal: "not_a_wrong_answer" });
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(), ...ROUTABLE }))
      .toEqual({ route: false, refusal: "not_a_wrong_answer" });
  });

  it("routes a wrong answer whatever grant the run happens to hold", () => {
    // **The old assertion was the bug.** The route tested the grant's purpose
    // against a set, so a Flow built from an instruction -- which runs under
    // `build_and_adapt` -- and a run holding a narrower grant were both refused
    // `grant_does_not_buy_exploration` and stopped. Across five live runs the
    // wrong-answer repair therefore never executed once: `run-muhnh0s5-98a27f42`
    // stored eight rows where thirteen were expected, was correctly refuted, and
    // recorded no patch attempt, no adaptation and no change proposal. Nothing
    // about repairing a Flow is a risky act, so no purpose closes this door.
    // The decision no longer has a field to read a purpose from, which is what
    // makes this assertion hold for every one of them at once.
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE }))
      .toEqual({ route: true, projectId: ROUTABLE.projectId, flowId: ROUTABLE.flowId });
  });

  it("does not route a run with no Flow to extend", () => {
    // The one remaining refusal is an inability rather than a permission: there
    // is no draft to start from. A training setting that forbids creating
    // adaptations no longer closes the route either -- it described the patch
    // ladder's proposals, and this route builds through the Flow Bootstrap entry
    // point, so refusing here only stopped the repair the person asked for.
    expect(automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE, flowId: undefined }))
      .toEqual({ route: false, refusal: "flow_unavailable" });
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
    const recorded = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision, failure: { code: "flow_bootstrap.evidence_runtime_unavailable" } });
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
      failureCode: () => ({ code: "flow_bootstrap.extend_failed" })
    };
  };

  it("builds, approves and applies, in that order, and says the Flow changed", async () => {
    const step = steps();
    await expect(automationStudioReauthorRefutedResult(step)).resolves.toEqual({ adaptationId: "adaptation.bootstrap.1", applied: true });
    expect(step.order).toEqual(["generate", "approve:adaptation.bootstrap.1", "apply:adaptation.bootstrap.1"]);
  });

  it("reports the code a build failed under, and names no adaptation, when nothing was built", async () => {
    const step = steps();
    await expect(automationStudioReauthorRefutedResult({ ...step, generate: async () => { throw new Error("no provider"); }, failureCode: () => ({ code: "flow_bootstrap.provider_resolution_failed" }) }))
      .resolves.toEqual({ failure: { code: "flow_bootstrap.provider_resolution_failed" } });
    expect(step.order).toEqual([]);
  });

  it("records what kind of failure it was, not only the stage's default code", async () => {
    // run-muhqop38-997ee8e5, the first run in which this route opened, recorded
    // flow_bootstrap.provider_request_failed — the default code for the whole
    // provider_request stage, which says a request was attempted and its answer
    // is unknown and nothing more. A timeout, a transport error, a refused
    // grant and a provider status are all that one word, and the diagnostic
    // that told them apart was parsed and discarded.
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({
      ...step,
      generate: async () => { throw new Error("transport"); },
      failureCode: () => ({
        code: "flow_bootstrap.provider_request_failed",
        stage: "provider_request",
        retryable: true,
        providerInvocation: "unknown" as const,
        providerResponse: "unknown" as const,
        providerStatus: 504
      })
    });
    const detail = automationStudioRefutedResultReauthored({
      detail: { summary: { runId: "run.1", flowId: "flow.1", status: "failed" } } as never,
      decision: { route: true, projectId: "project.1", flowId: "flow.1" },
      ...result
    });
    expect(detail.metadata?.resultReauthor).toEqual({
      routed: true,
      code: "flow_bootstrap.provider_request_failed",
      stage: "provider_request",
      retryable: true,
      providerInvocation: "unknown",
      providerResponse: "unknown",
      providerStatus: 504
    });
  });

  it("publishes no facts the caller could not read, so absent stays absent", () => {
    const detail = automationStudioRefutedResultReauthored({
      detail: { summary: { runId: "run.1", flowId: "flow.1", status: "failed" } } as never,
      decision: { route: true, projectId: "project.1", flowId: "flow.1" },
      failure: { code: "flow_bootstrap.extend_failed" }
    });
    expect(detail.metadata?.resultReauthor).toEqual({ routed: true, code: "flow_bootstrap.extend_failed" });
  });

  it("keeps the proposal when approval is refused, and does not say the Flow changed", async () => {
    // What a build that had to ask the person a question does: the edit exists
    // and waits for their answer, and nothing is applied behind them.
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, approve: async () => { throw new Error("permission unanswered"); }, failureCode: () => ({ code: "flow_bootstrap.permission_unanswered" }) });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failure: { code: "flow_bootstrap.permission_unanswered" } });
    expect(step.order).toEqual(["generate"]);
    expect(result.applied).toBeUndefined();
  });

  it("keeps the proposal when the apply is refused", async () => {
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, apply: async () => { throw new Error("stale"); } });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failure: { code: "flow_bootstrap.extend_failed" } });
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
    const proposed = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.1", failure: { code: "flow_bootstrap.permission_unanswered" } });
    expect(automationStudioRefutedResultFlowWasReauthored(proposed)).toBe(false);
  });

  it("is false for a run that was never routed", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE });
    expect(automationStudioRefutedResultFlowWasReauthored(automationStudioRefutedResultReauthored({ detail: detail(), decision }))).toBe(false);
  });
});
