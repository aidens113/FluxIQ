import { describe, expect, it } from "vitest";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import { automationStudioMakeJudgeCheckpoint, automationStudioResultRunTrail, automationStudioResultTrailOfAttempts, automationStudioResultTrailOfObservations, automationStudioResultTrailStepOfCall } from "../../run-trail/index.ts";
import { automationStudioResultJudgeSummary } from "../summary.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";

const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] };
const RAW = "PRIVATE_CAPTURE_SENTINEL";
const value = { read: { extracted: [{ name: "Original", amount: 2 }] }, page: RAW };

function steps(source: "call" | "flow" | "build") {
  if (source === "call") return [automationStudioResultTrailStepOfCall({ callId: "read.1", toolId: "read", value: {} }, { kind: "llm_evidence_tool_execution", evidence: value, effectApplied: false }, undefined, OPTIONS)];
  if (source === "flow") return automationStudioResultTrailOfAttempts([{ nodeId: "read", attemptId: "read.1", outputs: value, effectApplied: false }], [{ id: "read" }], [], OPTIONS);
  return automationStudioResultTrailOfObservations([{ step: 1, evidence: value, effectApplied: false }], () => "read", OPTIONS);
}

function summary(trail: ReturnType<typeof automationStudioResultRunTrail>["trail"]): AutomationStudioRunResultSummary {
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 0, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 0, recordSets: [], flowShape: [], withheld: false, ...(trail === undefined ? {} : { trail }) };
}

describe("exact original semantic reprojection", () => {
  it("uses the engine's actual complete call-flow path and never fills in a missing ancestor identity", () => {
    const nested = { nodeId: "call", attemptId: "call/one", childTrace: { attempts: [{ nodeId: "read", attemptId: "read%two", outputs: value }] } };
    expect(automationStudioResultTrailOfAttempts([nested], [], [], OPTIONS)[1]?.judgeSource?.source).toBe("call%2Fone/read%25two");
    const legacy = { nodeId: "call", childTrace: nested.childTrace };
    expect(automationStudioResultTrailOfAttempts([legacy], [], [], OPTIONS)[1]?.judgeSource).toBeUndefined();
  });

  it.each(["call", "flow", "build"] as const)("repairs only the original %s input, keeps the historical code, and checkpoints the recovered finding", (source) => {
    const original = steps(source);
    const before = structuredClone(original);
    let calls = 0;
    const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
      calls += 1;
      expect(JSON.stringify(input)).toContain(RAW);
      expect(Object.isFrozen(input)).toBe(true);
      return { role: "data", evidence: { observedRows: 1 } };
    };
    const options = { ...OPTIONS, projectJudgeEvidence: projector };
    const shown = automationStudioResultJudgeSummary(summary(automationStudioResultRunTrail(original, []).trail), options);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(shown.trail?.entries[0]?.found).toEqual({ role: "data", evidence: { observedRows: 1 }, history: [{ codes: ["judge_evidence.projector_missing"], by: "original-source" }] });
    const checkpoint = automationStudioMakeJudgeCheckpoint(original, {}, options);
    expect(checkpoint.trail[0]?.judgeEvidence?.history).toEqual([{ codes: ["judge_evidence.projector_missing"], by: "original-source" }]);
    expect(checkpoint.trail[0]?.judgeEvidence?.missing).toEqual([]);
    expect(calls).toBe(1);
    expect(JSON.stringify(shown)).not.toContain(RAW);
    expect(JSON.stringify(checkpoint)).not.toContain(RAW);
    expect(original).toEqual(before);
  });

  it("does not project a restored failed finding or a later unrelated read as the missing original", () => {
    const original = steps("call");
    const restored = JSON.parse(JSON.stringify(automationStudioMakeJudgeCheckpoint(original, {}, OPTIONS))).trail;
    let calls = 0;
    const shown = automationStudioResultJudgeSummary(summary(automationStudioResultRunTrail(restored, []).trail), { ...OPTIONS, projectJudgeEvidence: () => {
      calls += 1;
      return { role: "data", evidence: { unrelated: true } };
    } });
    expect(calls).toBe(0);
    expect(shown.evidenceProjection?.missing).toContainEqual({ source: "read.1", codes: ["judge_evidence.projector_missing"] });
    expect(shown.trail?.entries[0]?.found).not.toHaveProperty("history");
  });
});
