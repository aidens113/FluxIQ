// What a Flow Bootstrap build publishes about its own decisions.
//
// Until now a *refused* build published every decision it made, and a
// *proposed* one published counts and a sorted set of tool ids -- so the
// successful builds worth studying were the ones nobody could see. Both halves
// of that gap are here: the sanitized trace stored on the adaptation kept
// neither the code a decision came to nor whether its effect was applied, and
// the audit detail built from it carried no steps at all.

import { describe, expect, it } from "vitest";
import { bootstrapAdaptationAsFlowAdaptation, type AutomationStudioBootstrapAdaptation } from "../../../flow-bootstrap/index.ts";
import type { AutomationStudioLlmEvidenceLoopTrace } from "../../../llm/index.ts";
import { bootstrapAdaptationAuditEvent } from "../audit-event.ts";
import { evidenceTraceAuditDetail, sanitizeEvidenceLoopTrace } from "../evidence-trace.ts";

const trace: AutomationStudioLlmEvidenceLoopTrace[] = [
  { iteration: 0, decision: "tool_call", callId: "call-0", toolId: "web.observe_page", evidenceBytes: 1_200, resultCode: "ok", effectApplied: false },
  { iteration: 1, decision: "tool_call", callId: "call-1", toolId: "web.dom.type", evidenceBytes: 800, resultCode: "ok", effectApplied: true },
  { iteration: 2, decision: "unusable", resultCode: "flow_script.unknown_node" },
  { iteration: 3, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_amended" },
  { iteration: 4, decision: "complete" }
];

describe("the trace stored on a build", () => {
  it("keeps the code each decision came to and whether its effect was applied", () => {
    expect(sanitizeEvidenceLoopTrace(trace)[1]).toEqual({ iteration: 1, decision: "tool_call", callId: "call-1", toolId: "web.dom.type", evidenceBytes: 800, resultCode: "ok", effectApplied: true });
  });

  it("leaves behind a result code that is not code-shaped, rather than failing the build over a reader's detail", () => {
    const sentence = sanitizeEvidenceLoopTrace([{ iteration: 0, decision: "unusable", resultCode: "The model replied with prose about the page." }]);

    expect(sentence[0]).toEqual({ iteration: 0, decision: "unusable" });
  });

  it("refuses an effect flag that is not a flag, because a trace Core did not write is not one to publish", () => {
    expect(() => sanitizeEvidenceLoopTrace([{ iteration: 0, decision: "tool_call", toolId: "web.dom.type", effectApplied: "yes" as unknown as boolean }]))
      .toThrow("Flow Bootstrap evidence effect flag is invalid.");
  });
});

describe("the audit detail a proposed build carries", () => {
  it("publishes every decision in order, naming a tool-less one by Core's own step id", () => {
    expect(evidenceTraceAuditDetail(trace).steps).toEqual([
      { toolId: "web.observe_page", iteration: 0, effectApplied: false, resultCode: "ok", evidenceBytes: 1_200 },
      { toolId: "web.dom.type", iteration: 1, effectApplied: true, resultCode: "ok", evidenceBytes: 800 },
      { toolId: "core.decision_unusable", iteration: 2, resultCode: "flow_script.unknown_node" },
      { toolId: "core.decision_amend_draft", iteration: 3, resultCode: "llm_evidence_loop.draft_amended" },
      { toolId: "core.decision_complete", iteration: 4 }
    ]);
  });

  it("carries the iteration, the bytes, the moment and the tokens the trace had already kept", () => {
    // The defect: the sanitized trace keeps `iteration`, `evidenceBytes`, `at`
    // and the provider's `usage` for every row, and the published step kept
    // three fields of the eight. A failed build's 32 decisions therefore
    // arrived as a tool id and a code each -- twenty of them the same code,
    // inside one undivided 99,375 ms gap -- so three different defects with
    // three different fixes read as one word, twenty times.
    const [step] = evidenceTraceAuditDetail([
      { iteration: 7, decision: "tool_call", callId: "call-7", toolId: "web.dom.click", evidenceBytes: 640, at: 1_758_672_000_000, usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.0004 } }
    ]).steps as Array<Record<string, unknown>>;

    expect(step).toEqual({
      toolId: "web.dom.click",
      iteration: 7,
      evidenceBytes: 640,
      at: 1_758_672_000_000,
      usage: { inputTokens: 900, outputTokens: 60, totalTokens: 960, estimatedCostUsd: 0.0004 }
    });
  });

  it("leaves the model's own call id in the stored trace and never in a published step", () => {
    // A call id is whatever the decision asked for, kept verbatim
    // (`runtime/llm/evidence-loop.ts`'s `unusedCallId`), so it is model-written
    // text and a published step carries codes and identifiers only. The stored
    // trace keeps it; the step does not, and `iteration` ties the two together.
    const row = { iteration: 1, decision: "tool_call" as const, callId: "whatever the model called it", toolId: "web.dom.click" };

    expect(sanitizeEvidenceLoopTrace([row])[0]?.callId).toBe("whatever the model called it");
    expect(JSON.stringify(evidenceTraceAuditDetail([row]).steps)).not.toContain("whatever the model called it");
  });

  it("leaves behind a moment that is not a moment, rather than failing a build that finished over a reader's detail", () => {
    for (const at of [-1, 1.5, Number.NaN, "yesterday" as unknown as number]) {
      const [row] = sanitizeEvidenceLoopTrace([{ iteration: 1, decision: "complete", at }]);

      expect(row).toEqual({ iteration: 1, decision: "complete" });
    }
  });

  it("keeps the counts and the sorted tool ids it always published, which say what was used and never what was done", () => {
    const detail = evidenceTraceAuditDetail(trace);

    expect(detail).toMatchObject({ evidenceGuided: true, iterationCount: 5, toolCallCount: 2, evidenceBytes: 2_000, toolIds: ["web.dom.type", "web.observe_page"] });
  });

  it("publishes an empty step list for an empty trace rather than inventing one", () => {
    expect(evidenceTraceAuditDetail([]).steps).toEqual([]);
  });

  it("reaches the review projection a proposal is read through, where the steps end up being read from", () => {
    // The whole point of the change. A proposed build's decisions are read
    // from `metadata.phase9.auditEvents[created].detail`, which is where the
    // review projection puts the created audit event -- so this is the path,
    // end to end, that made a successful build's trail unreadable while a
    // refused one's was published in full.
    const adaptation: AutomationStudioBootstrapAdaptation = {
      schemaVersion: "0.1",
      kind: "flow_bootstrap",
      adaptationId: "adaptation.bootstrap.one",
      projectId: "project.one",
      flowId: "flow.one",
      baseDependencyDigest: "digest.base",
      baseSettingsRevision: 1,
      sourceInstructionIds: ["instruction.one"],
      summary: "Build the active instruction.",
      riskLevel: "low",
      buildPlan: {} as AutomationStudioBootstrapAdaptation["buildPlan"],
      topology: { router: { routerId: "router.one", name: "Router", rules: [] }, subflows: [] } as unknown as AutomationStudioBootstrapAdaptation["topology"],
      status: "proposed",
      createdAt: 1,
      updatedAt: 1,
      evidenceTrace: sanitizeEvidenceLoopTrace(trace),
      auditEvents: [bootstrapAdaptationAuditEvent({
        adaptationId: "adaptation.bootstrap.one",
        eventType: "created",
        actorId: null,
        fromStatus: null,
        toStatus: "proposed",
        createdAt: 1,
        detail: evidenceTraceAuditDetail(trace)
      })]
    };

    const projected = bootstrapAdaptationAsFlowAdaptation(adaptation, { executionDigest: "digest.current", settingsRevision: 1 });
    const created = (projected.metadata as { phase9: { auditEvents: Array<{ eventType: string; detail: { steps?: unknown } }> } }).phase9.auditEvents.find((event) => event.eventType === "created");

    expect(created?.detail.steps).toEqual([
      { toolId: "web.observe_page", iteration: 0, effectApplied: false, resultCode: "ok", evidenceBytes: 1_200 },
      { toolId: "web.dom.type", iteration: 1, effectApplied: true, resultCode: "ok", evidenceBytes: 800 },
      { toolId: "core.decision_unusable", iteration: 2, resultCode: "flow_script.unknown_node" },
      { toolId: "core.decision_amend_draft", iteration: 3, resultCode: "llm_evidence_loop.draft_amended" },
      { toolId: "core.decision_complete", iteration: 4 }
    ]);
  });
});

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

const SPEND_TRACE: AutomationStudioLlmEvidenceLoopTrace[] = [
  { iteration: 0, decision: "tool_call", callId: "call.0", toolId: "core.run_node", evidenceBytes: 10 },
  { iteration: 1, decision: "tool_call", callId: "call.1", toolId: "core.run_node", evidenceBytes: 20 },
  { iteration: 2, decision: "complete" }
];

describe("what a build's created-audit counts", () => {
  it("keeps the loop's two counts equal, and puts the build's other calls beside them", () => {
    const detail = evidenceTraceAuditDetail(SPEND_TRACE, 1);

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
    const detail = evidenceTraceAuditDetail(SPEND_TRACE);

    expect(detail.additionalProviderCallCount).toBe(0);
    expect(detail.totalProviderCallCount).toBe(detail.providerCallCount);
  });

  it("ignores an extra count that is not a whole number of calls", () => {
    for (const bad of [-1, 1.5, Number.NaN]) {
      expect(evidenceTraceAuditDetail(SPEND_TRACE, bad).totalProviderCallCount).toBe(2);
    }
  });

  it("counts a call per iteration and not per trace row, when a decision edited the draft and re-ran a step", () => {
    // The defect this pins. An `amend_draft` carrying a `rerun` writes its own
    // row and then the row for the call the rerun makes, both under the one
    // iteration that paid for them. Counting rows charged
    // `run-mudw1ktb-0557816b` with 22 provider calls when it made 16, and every
    // per-call figure derived from it -- tokens, money, seconds -- came out 27%
    // too low.
    const withReruns: AutomationStudioLlmEvidenceLoopTrace[] = [
      { iteration: 0, decision: "tool_call", callId: "call.0", toolId: "core.run_node", evidenceBytes: 10 },
      { iteration: 1, decision: "tool_call", callId: "call.1", toolId: "core.run_node", evidenceBytes: 20 },
      { iteration: 2, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_rerun" },
      { iteration: 2, decision: "tool_call", callId: "rerun.1", toolId: "core.run_node", evidenceBytes: 30 },
      { iteration: 3, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_rerun" },
      { iteration: 3, decision: "tool_call", callId: "rerun.2", toolId: "core.run_node", evidenceBytes: 30 },
      { iteration: 4, decision: "complete" }
    ];

    const detail = evidenceTraceAuditDetail(withReruns);

    expect(detail.providerCallCount).toBe(4);
    expect(detail.decisionCount).toBe(4);
    expect(detail.totalProviderCallCount).toBe(4);
    // Seven rows, four decisions, five iterations counting the deterministic
    // opening observation. The reader's whole contract still holds on them.
    expect(detail.traceStepCount).toBe(7);
    expect(detail.iterationCount).toBe(5);
    expect(detail.toolCallCount).toBe(4);
    expect(detail.decisionCount).toBe(detail.providerCallCount);
    expect(detail.iterationCount as number).toBeGreaterThanOrEqual(detail.providerCallCount as number);
    expect(detail.iterationCount as number).toBeLessThanOrEqual((detail.providerCallCount as number) + 1);
  });

  it("keeps a trace whose decisions each wrote two rows, rather than throwing the build's whole record away", () => {
    // The row bound was one per decision, which is not what the loop writes, so
    // a build that corrected itself often enough would have had its entire
    // published record discarded as malformed.
    const doubled: AutomationStudioLlmEvidenceLoopTrace[] = Array.from({ length: 64 }, (_, index) => [
      { iteration: index + 1, decision: "amend_draft" as const, resultCode: "llm_evidence_loop.draft_rerun" },
      { iteration: index + 1, decision: "tool_call" as const, callId: `rerun.${index + 1}`, toolId: "core.run_node", evidenceBytes: 1 }
    ]).flat();

    expect(() => sanitizeEvidenceLoopTrace(doubled)).not.toThrow();
    expect(evidenceTraceAuditDetail(doubled).providerCallCount).toBe(64);
    expect(evidenceTraceAuditDetail(doubled).traceStepCount).toBe(128);
    expect(() => sanitizeEvidenceLoopTrace([...doubled, ...doubled])).toThrow("Flow Bootstrap evidence trace is invalid.");
  });
});

// A build's calls, one line each.
//
// A run gets a per-call ledger because it holds a budget lease and something
// counts each call as it is settled. A build holds none, so nothing itemized
// its calls and a downstream reader published an empty list beside a total it
// could not break down (`packages/test-runner/src/live-llm/build-usage.ts`
// hard-codes `observedCalls: []`). The lines below are read back from the rows
// the loop had already written.

describe("a build's provider calls, itemized", () => {
  it("writes one line per paid call, in the same record a run's calls are itemized in", () => {
    const calls = evidenceTraceAuditDetail([
      { iteration: 0, decision: "tool_call", toolId: "web.observe_page", evidenceBytes: 10 },
      { iteration: 1, decision: "tool_call", toolId: "web.dom.click", usage: { inputTokens: 1_000, outputTokens: 80, totalTokens: 1_080, estimatedCostUsd: 0.0005 } },
      { iteration: 2, decision: "complete", usage: { inputTokens: 1_200, outputTokens: 40, totalTokens: 1_240, estimatedCostUsd: 0.0006 } }
    ]).providerCalls as Array<Record<string, unknown>>;

    // Two paid calls, not three rows: iteration 0 is the deterministic opening
    // observation and no provider was asked anything for it.
    expect(calls).toHaveLength(2);
    expect(calls[0]).toMatchObject({
      sequence: 1,
      requestId: null,
      allowance: "exploration",
      reported: { inputTokens: 1_000, outputTokens: 80, totalTokens: 1_080, estimatedCostUsd: 0.0005 },
      charged: { inputTokens: 1_000, outputTokens: 80, totalTokens: 1_080, estimatedCostUsd: 0.0005, tokens: "reported", cost: "reported" },
      budgetBreach: false
    });
    // `sequence` is the iteration that paid for the call, which is what
    // `steps[].iteration` says too, so a line and its decision join on it.
    expect(calls[1]?.sequence).toBe(2);
  });

  it("charges a call the provider reported nothing for as zero, and says the figure was never measured", () => {
    const [call] = evidenceTraceAuditDetail([{ iteration: 1, decision: "complete" }]).providerCalls as Array<Record<string, unknown>>;

    expect(call).toMatchObject({
      reported: { inputTokens: null, outputTokens: null, totalTokens: null, estimatedCostUsd: null },
      charged: { inputTokens: 0, outputTokens: 0, totalTokens: 0, estimatedCostUsd: 0, tokens: "reserved", cost: "reserved" }
    });
  });

  it("folds the two rows of a decision that re-ran a step into the one call that paid for them", () => {
    const calls = evidenceTraceAuditDetail([
      { iteration: 1, decision: "amend_draft", resultCode: "llm_evidence_loop.draft_rerun", usage: { inputTokens: 500, outputTokens: 20, totalTokens: 520 } },
      { iteration: 1, decision: "tool_call", toolId: "core.run_node", evidenceBytes: 30 }
    ]).providerCalls as Array<Record<string, unknown>>;

    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ sequence: 1, reported: { inputTokens: 500, totalTokens: 520 } });
  });

  it("says how many counted calls the lines do not itemize, so a reader can tell a short receipt from a whole one", () => {
    // The build's calls outside the loop -- reading the person's instruction --
    // leave no trace row, so they are counted and not itemized.
    const detail = evidenceTraceAuditDetail(SPEND_TRACE, 1);

    expect((detail.providerCalls as unknown[]).length).toBe(2);
    expect(detail.providerCallsOmitted).toBe(1);
    expect(detail.totalProviderCallCount).toBe(3);
  });
});
