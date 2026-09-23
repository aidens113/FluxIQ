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
      { toolId: "web.observe_page", effectApplied: false, resultCode: "ok" },
      { toolId: "web.dom.type", effectApplied: true, resultCode: "ok" },
      { toolId: "core.decision_unusable", resultCode: "flow_script.unknown_node" },
      { toolId: "core.decision_amend_draft", resultCode: "llm_evidence_loop.draft_amended" },
      { toolId: "core.decision_complete" }
    ]);
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
      { toolId: "web.observe_page", effectApplied: false, resultCode: "ok" },
      { toolId: "web.dom.type", effectApplied: true, resultCode: "ok" },
      { toolId: "core.decision_unusable", resultCode: "flow_script.unknown_node" },
      { toolId: "core.decision_amend_draft", resultCode: "llm_evidence_loop.draft_amended" },
      { toolId: "core.decision_complete" }
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
