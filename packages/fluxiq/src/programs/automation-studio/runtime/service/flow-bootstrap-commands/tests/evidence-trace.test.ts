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
