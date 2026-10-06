// Where a wrong answer goes, and every reason it does not go there.
//
// The route exists because the patch ladder could never have helped a Flow
// missing a step, so the assertion that matters most is the negative one: a run
// that failed for anything else still goes exactly where it went before, and
// says so on the record.
//
// What used to be asserted here, and is now asserted the other way round, is
// that a run's purpose and a training setting could close the route. Both
// were permission questions asked about repairing a Flow, which is not a risky
// act, and both are gone (t166).

import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowRunDetail } from "../../../../model/index.ts";
import { AUTOMATION_STUDIO_RESULT_REPAIR_METADATA_KEY } from "../history.ts";
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

  it("routes a wrong answer whatever purpose the run happens to have", () => {
    // **The old assertion was the bug.** The route tested the run's purpose
    // against a set, so a Flow built from an instruction -- which runs under
    // `build_and_adapt` -- and a run with a narrower purpose were both refused
    // for it and stopped. Across five live runs the
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
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, adaptationId: "adaptation.bootstrap.1", attempts: [{ routed: true, adaptationId: "adaptation.bootstrap.1" }] });
  });

  it("names the code a routed run failed under, so a route that reached nothing is not a silence", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), ...ROUTABLE });
    const recorded = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision, failure: { code: "flow_bootstrap.evidence_runtime_unavailable" } });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, code: "flow_bootstrap.evidence_runtime_unavailable", attempts: [{ routed: true, code: "flow_bootstrap.evidence_runtime_unavailable" }] });
  });

  it("names why a run was not routed, and keeps everything else the run carried", () => {
    const decision = automationStudioRefutedResultReauthorDecision({ detail: detail("core.result.verdict_unsure"), ...ROUTABLE });
    const recorded = automationStudioRefutedResultReauthored({ detail: detail("core.result.verdict_unsure"), decision });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: false, code: "not_a_wrong_answer", attempts: [{ routed: false, code: "not_a_wrong_answer" }] });
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
    await expect(automationStudioReauthorRefutedResult(step)).resolves.toEqual({ adaptationId: "adaptation.bootstrap.1", applied: true, durationMs: expect.any(Number) });
    expect(step.order).toEqual(["generate", "approve:adaptation.bootstrap.1", "apply:adaptation.bootstrap.1"]);
  });

  it("reports the code a build failed under, and names no adaptation, when nothing was built", async () => {
    const step = steps();
    await expect(automationStudioReauthorRefutedResult({ ...step, generate: async () => { throw new Error("no provider"); }, failureCode: () => ({ code: "flow_bootstrap.provider_resolution_failed" }) }))
      .resolves.toEqual({ failure: { code: "flow_bootstrap.provider_resolution_failed" }, durationMs: expect.any(Number) });
    expect(step.order).toEqual([]);
  });

  it("records what kind of failure it was, not only the stage's default code", async () => {
    // run-muhqop38-997ee8e5, the first run in which this route opened, recorded
    // flow_bootstrap.provider_request_failed — the default code for the whole
    // provider_request stage, which says a request was attempted and its answer
    // is unknown and nothing more. A timeout, a transport error, a refused
    // credential and a provider status are all that one word, and the diagnostic
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
    expect(detail.metadata?.resultReauthor).toMatchObject({
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
    expect(detail.metadata?.resultReauthor).toEqual({ routed: true, code: "flow_bootstrap.extend_failed", attempts: [{ routed: true, code: "flow_bootstrap.extend_failed" }] });
  });

  it("keeps the proposal when approval is refused, and does not say the Flow changed", async () => {
    // What a build that had to ask the person a question does: the edit exists
    // and waits for their answer, and nothing is applied behind them.
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, approve: async () => { throw new Error("permission unanswered"); }, failureCode: () => ({ code: "flow_bootstrap.permission_unanswered" }) });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failure: { code: "flow_bootstrap.permission_unanswered" }, durationMs: expect.any(Number) });
    expect(step.order).toEqual(["generate"]);
    expect(result.applied).toBeUndefined();
  });

  it("keeps the proposal when the apply is refused", async () => {
    const step = steps();
    const result = await automationStudioReauthorRefutedResult({ ...step, apply: async () => { throw new Error("stale"); } });
    expect(result).toEqual({ adaptationId: "adaptation.bootstrap.1", failure: { code: "flow_bootstrap.extend_failed" }, durationMs: expect.any(Number) });
    expect(step.order).toEqual(["generate", "approve:adaptation.bootstrap.1"]);
  });
});

describe("whether the Flow was actually changed", () => {
  const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

  it("is true only once the edit reached the Flow", () => {
    const applied = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.1", applied: true });
    expect(automationStudioRefutedResultFlowWasReauthored(applied)).toBe(true);
    expect(applied.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, adaptationId: "adaptation.1", applied: true, attempts: [{ routed: true, adaptationId: "adaptation.1", applied: true }] });
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

// run-mulwm2dc-0bd95f22: a four-minute re-author left nothing on the run but an
// adaptation id. Each attempt is now recorded, and a second attempt adds to the
// list rather than replacing the first.
describe("every re-author a run makes, recorded", () => {
  const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

  it("keeps the earlier attempts when a later one is recorded, with the latest at the top level", () => {
    const first = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.1", applied: true, attempt: 1, durationMs: 240_000.4, accounting: { requestId: "evidence.1", totalTokens: 90_000, estimatedCostUsd: 0.05 }, brief: { findingCodes: ["result.counts_look_right"], earlierAttempts: 0 } });
    const second = automationStudioRefutedResultReauthored({ detail: first, decision: routed, attempt: 2, durationMs: 1_000, failure: { code: "flow_bootstrap.provider_http_error", accounting: { requestId: "evidence.2", inputTokens: 10 }, evidenceLoop: { iterationCount: 3, decisionCount: 3, toolCallCount: 2, evidenceBytes: 400, steps: [{ toolId: "core.evidence_loop.complete", iteration: 3, resultCode: "draft_unchanged" }] } } });
    const marker = second.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY] as { attempt?: number; applied?: boolean; code?: string; attempts?: Array<Record<string, unknown>> };
    expect(marker).toMatchObject({ routed: true, attempt: 2, code: "flow_bootstrap.provider_http_error" });
    expect(marker.applied).toBeUndefined();
    expect(marker.attempts).toHaveLength(2);
    expect(marker.attempts?.[0]).toMatchObject({ attempt: 1, adaptationId: "adaptation.1", applied: true, durationMs: 240_000, accounting: { totalTokens: 90_000 }, brief: { findingCodes: ["result.counts_look_right"] } });
    // A build that failed part way keeps its own decision rows on the run, since it left no adaptation to hold them.
    expect(marker.attempts?.[1]).toMatchObject({ attempt: 2, code: "flow_bootstrap.provider_http_error", accounting: { requestId: "evidence.2" }, evidenceLoop: { decisionCount: 3, steps: [{ resultCode: "draft_unchanged" }] } });
  });

  it("answers what the build spent beside its adaptation when the build reports it", async () => {
    const result = await automationStudioReauthorRefutedResult({
      generate: async () => ({ adaptationId: "adaptation.2", accounting: { requestId: "evidence.9", totalTokens: 1_234 } }),
      approve: async () => undefined,
      apply: async () => undefined,
      failureCode: () => ({ code: "unused" }),
      now: (() => { let clock = 1_000; return () => (clock += 500); })()
    });
    expect(result).toEqual({ adaptationId: "adaptation.2", applied: true, accounting: { requestId: "evidence.9", totalTokens: 1_234 }, durationMs: 500 });
  });
});

// t267: a re-author is kept only after a whole run that ran it is judged to
// answer. The run's routes hold their edit -- approved, not applied -- and the
// re-run runs it unapplied; the marker says it is held until the judged end
// settles it.
describe("holding the edit for the judged re-run", () => {
  const routed = { route: true as const, projectId: "project.demo", flowId: "flow.catalog" };

  it("approves and stops, under hold: nothing is applied and the answer says held", async () => {
    const order: string[] = [];
    const result = await automationStudioReauthorRefutedResult({
      generate: async () => { order.push("generate"); return "adaptation.held"; },
      approve: async (adaptationId) => { order.push(`approve:${adaptationId}`); },
      hold: true,
      failureCode: () => ({ code: "unused" })
    });
    expect(result).toEqual({ adaptationId: "adaptation.held", held: true, durationMs: expect.any(Number) });
    expect(order).toEqual(["generate", "approve:adaptation.held"]);
  });

  it("keeps a refused approval a failure under hold, never held", async () => {
    const result = await automationStudioReauthorRefutedResult({
      generate: async () => "adaptation.held",
      approve: async () => { throw new Error("permission unanswered"); },
      hold: true,
      failureCode: () => ({ code: "flow_bootstrap.permission_unanswered" })
    });
    expect(result).toEqual({ adaptationId: "adaptation.held", failure: { code: "flow_bootstrap.permission_unanswered" }, durationMs: expect.any(Number) });
  });

  it("records held on the latest fields and the attempt, and a held edit re-runs the Flow", () => {
    const recorded = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.held", held: true, attempt: 1 });
    expect(recorded.metadata?.[AUTOMATION_STUDIO_RESULT_REAUTHOR_METADATA_KEY]).toEqual({ routed: true, adaptationId: "adaptation.held", held: true, attempt: 1, attempts: [{ attempt: 1, routed: true, adaptationId: "adaptation.held", held: true }] });
    expect(automationStudioRefutedResultFlowWasReauthored(recorded)).toBe(true);
  });

  it("does not re-run a Flow whose latest re-author built nothing, though an earlier one is held", () => {
    const first = automationStudioRefutedResultReauthored({ detail: detail(AUTOMATION_STUDIO_RESULT_WRONG_ANSWER_CODE), decision: routed, adaptationId: "adaptation.first", held: true, attempt: 1 });
    const failed = automationStudioRefutedResultReauthored({ detail: first, decision: routed, failure: { code: "flow_bootstrap.provider_http_error" }, attempt: 2 });
    expect(automationStudioRefutedResultFlowWasReauthored(failed)).toBe(false);
  });
});
