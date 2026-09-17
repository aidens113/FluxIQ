import { describe, expect, it } from "vitest";
import type { AutomationStudioFlowAdaptation, AutomationStudioFlowAdaptationValidationResult } from "../../../model/index.ts";
import type { AutomationStudioBootstrapAuditEvent } from "../../flow-bootstrap/index.ts";
import { decideAutomationStudioChangeConfidence } from "../../flow-change/index.ts";
import {
  adaptationConfidence,
  adaptationValidationCounts,
  evaluateBootstrapAdaptationApplyGates,
  evaluateFlowAdaptationPromotionGates
} from "../adaptation-promotion.ts";

let clock = 100;

function result(status: "succeeded" | "failed", kind?: "trial" | "replay"): AutomationStudioFlowAdaptationValidationResult {
  clock += 1;
  return { runId: `run.${clock}`, status, checkedAt: clock, ...(kind ? { kind } : {}) };
}

const trial = (status: "succeeded" | "failed" = "succeeded") => result(status, "trial");
const replay = (status: "succeeded" | "failed" = "succeeded") => result(status, "replay");

// Results no trial or replay produced. Each is typed as a saved result, the way
// a corrupted or hand-written record reaches the gate after a cast.
const fabricated = {
  structuralCheck: () => ({ ...trial(), kind: "structural_check" }) as unknown as AutomationStudioFlowAdaptationValidationResult,
  unknownStatus: () => ({ ...trial(), status: "passed" }) as unknown as AutomationStudioFlowAdaptationValidationResult,
  timeless: () => ({ ...trial(), checkedAt: Number.NaN })
};

function adaptation(overrides: Partial<AutomationStudioFlowAdaptation> = {}): AutomationStudioFlowAdaptation {
  return {
    schemaVersion: "0.1",
    adaptationId: "adaptation.gate",
    flowId: "flow.gate",
    projectId: "project.gate",
    trigger: "missing confirmation",
    patch: [{ kind: "edit_action_target", targetId: "node.submit", summary: "Retarget submit" }],
    status: "proposed",
    author: "llm",
    riskLevel: "low",
    createdAt: 1,
    updatedAt: 1,
    ...overrides
  };
}

function approvedBy(reviewer: string): Partial<AutomationStudioFlowAdaptation> {
  return { metadata: { review: { lastAction: "approve", approvedBy: reviewer } } };
}

const EVIDENCE_ISSUE = "at least one successful trial or replay, or a named reviewer approval, is required";

describe("adaptation validation counts", () => {
  it("counts trials, replays and results written before kinds existed", () => {
    const validationResults = [trial(), replay(), result("succeeded"), trial("failed"), replay("failed")];
    expect(adaptationValidationCounts(adaptation({ validationResults }))).toEqual({ succeeded: 3, failed: 2, total: 5 });
  });

  it("ignores a result of any other kind, an unknown status, or no time", () => {
    const validationResults = [fabricated.structuralCheck(), fabricated.unknownStatus(), fabricated.timeless(), trial("failed")];
    expect(adaptationValidationCounts(adaptation({ validationResults }))).toEqual({ succeeded: 0, failed: 1, total: 1 });
  });
});

describe("adaptation confidence", () => {
  it("is the tier the change rules give the saved results", () => {
    const validationResults = [trial(), replay(), replay()];
    expect(adaptationConfidence(adaptation({ validationResults }))).toEqual(decideAutomationStudioChangeConfidence({ validationResults, riskLevel: "low" }));
    expect(adaptationConfidence(adaptation({ validationResults }))).toMatchObject({ tier: "established", trials: 1, replays: 2 });
  });

  it("reads the adaptation's risk", () => {
    expect(adaptationConfidence(adaptation({ riskLevel: "high", validationResults: [trial(), replay(), replay()] }))).toMatchObject({ tier: "provisional", replaysRequired: 3 });
  });

  it("is unverified for an adaptation with no results", () => {
    expect(adaptationConfidence(adaptation())).toEqual({ tier: "unverified", trials: 0, replays: 0, replaysRequired: 2 });
  });
});

describe("flow adaptation apply gates", () => {
  it("refuses an adaptation with no trial, no replay and no named approval", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation())).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("refuses a validated status on its own", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ status: "validated" }))).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("ignores a succeeded result of any other kind", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [fabricated.structuralCheck()] }))).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("ignores a succeeded result with no time", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [fabricated.timeless()] }))).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("ignores a result whose status is neither succeeded nor failed", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [fabricated.unknownStatus()] }))).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("accepts a succeeded trial", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [trial()] }))).toEqual({ ok: true, issues: [] });
  });

  it("accepts a succeeded result written before kinds existed", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [result("succeeded")] }))).toEqual({ ok: true, issues: [] });
  });

  it("accepts a succeeded replay", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [replay()] }))).toEqual({ ok: true, issues: [] });
  });

  it("accepts a named reviewer's approval in place of a trial", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation(approvedBy("reviewer.ada")))).toEqual({ ok: true, issues: [] });
  });

  it("does not take the runtime, or a blank name, for a reviewer", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation(approvedBy("runtime"))).ok).toBe(false);
    expect(evaluateFlowAdaptationPromotionGates(adaptation(approvedBy("   "))).ok).toBe(false);
  });

  it("refuses when the only trial failed, even with a named approval", () => {
    const gates = evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [trial("failed")], ...approvedBy("reviewer.ada") }));
    expect(gates.ok).toBe(false);
    expect(gates.issues).toEqual(["the latest trial failed; a succeeded trial or replay is required before it can be applied"]);
  });

  it("refuses when a trial failed after the last success, even with a named approval", () => {
    const gates = evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [trial(), trial("failed")], ...approvedBy("reviewer.ada") }));
    expect(gates).toEqual({ ok: false, issues: ["the latest trial failed; a succeeded trial or replay is required before it can be applied"] });
  });

  it("refuses when a replay failed after the last success", () => {
    const gates = evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [trial(), replay(), replay("failed")] }));
    expect(gates).toEqual({ ok: false, issues: ["the latest replay failed; a succeeded trial or replay is required before it can be applied"] });
  });

  it("accepts a success after an earlier failure", () => {
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults: [trial("failed"), trial()] }))).toEqual({ ok: true, issues: [] });
  });

  it("keeps refusing destructive, disabled, rejected, unlinked structural and untargeted adaptations", () => {
    const validationResults = [trial()];
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults, riskLevel: "destructive" })).issues).toEqual(["destructive adaptations require manual proposal review"]);
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults, status: "disabled" })).issues).toEqual(["disabled adaptations cannot be applied"]);
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults, status: "rejected" })).issues).toEqual(["rejected adaptations cannot be applied"]);
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults, patch: [{ kind: "edit_router", targetId: "router.main", summary: "Add a route" }] })).issues)
      .toEqual(["structural adaptations require a linked change proposal"]);
    expect(evaluateFlowAdaptationPromotionGates(adaptation({ validationResults, patch: [{ kind: "edit_action_target", targetId: " ", summary: "Retarget" }] })).issues)
      .toEqual(["patch edit_action_target is missing a target"]);
  });
});

type BootstrapGateSubject = Parameters<typeof evaluateBootstrapAdaptationApplyGates>[0];

function bootstrap(overrides: Partial<BootstrapGateSubject> = {}): BootstrapGateSubject {
  return { status: "proposed", riskLevel: "low", auditEvents: [auditEvent("created", null)], ...overrides };
}

function auditEvent(eventType: AutomationStudioBootstrapAuditEvent["eventType"], actorId: string | null): AutomationStudioBootstrapAuditEvent {
  clock += 1;
  return {
    eventId: `event.${clock}`,
    adaptationId: "bootstrap.gate",
    eventType,
    actorId,
    fromStatus: null,
    toStatus: null,
    reason: "",
    detail: {},
    detailObjectId: null,
    createdAt: clock
  };
}

describe("flow bootstrap apply gates", () => {
  it("refuses a proposal with no trial and no named approval", () => {
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap())).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("refuses a validated status with no named approval behind it", () => {
    const anonymous = bootstrap({ status: "validated", auditEvents: [auditEvent("created", null), auditEvent("approved", null)] });
    expect(evaluateBootstrapAdaptationApplyGates(anonymous)).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
    const runtime = bootstrap({ status: "validated", auditEvents: [auditEvent("approved", "runtime")] });
    expect(evaluateBootstrapAdaptationApplyGates(runtime)).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("accepts a named approval", () => {
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ status: "validated", auditEvents: [auditEvent("created", null), auditEvent("approved", "reviewer.ada")] })))
      .toEqual({ ok: true, issues: [] });
  });

  it("accepts a succeeded trial of the proposed topology", () => {
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ validationResults: [trial()] }))).toEqual({ ok: true, issues: [] });
  });

  it("ignores a succeeded result of any other kind", () => {
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ validationResults: [fabricated.structuralCheck()] }))).toEqual({ ok: false, issues: [EVIDENCE_ISSUE] });
  });

  it("refuses a proposal whose latest trial failed, even with a named approval", () => {
    const subject = bootstrap({ status: "validated", validationResults: [trial(), trial("failed")], auditEvents: [auditEvent("approved", "reviewer.ada")] });
    expect(evaluateBootstrapAdaptationApplyGates(subject)).toEqual({ ok: false, issues: ["the latest trial failed; a succeeded trial or replay is required before it can be applied"] });
  });

  it("tolerates a record saved without audit events", () => {
    const legacy = { ...bootstrap({ validationResults: [trial()] }), auditEvents: undefined } as unknown as BootstrapGateSubject;
    expect(evaluateBootstrapAdaptationApplyGates(legacy)).toEqual({ ok: true, issues: [] });
  });

  it("refuses a rejected, reverted or already applied proposal", () => {
    const validationResults = [trial()];
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ validationResults, status: "rejected" })).issues).toEqual(["rejected adaptations cannot be applied"]);
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ validationResults, status: "reverted" })).issues).toEqual(["reverted Flow Bootstrap adaptations cannot be applied again"]);
    expect(evaluateBootstrapAdaptationApplyGates(bootstrap({ validationResults, status: "applied" })).issues).toEqual(["Flow Bootstrap adaptation is already applied"]);
  });
});
