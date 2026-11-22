import { describe, expect, it } from "vitest";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../flow-less/judged-summary.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioMakeJudgeCheckpoint, automationStudioReadJudgeCheckpoint } from "../checkpoint/index.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../../../framework/automation-service/service/answer-first/trail/index.ts";

const REF = { callId: "actual.call", actId: "actual.act" };
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [], projectJudgeEvidence: () => ({ role: "observation" as const, evidence: { semanticStatus: "current" } }) };
const step = (): AutomationStudioResultTrailStep => ({ did: "actual.update", callId: REF.callId, judgeAct: REF, framework: { effectApplied: true }, judgeEvidence: { version: 1, role: "action", evidence: { control: "Save" }, missing: ["example.action_response_missing"], withheld: true } });

describe("durable source/witness recovery authority", () => {
  it("roundtrips only exact actual call/act associations and never reuses the old after on restart", () => {
    const checkpoint = automationStudioMakeJudgeCheckpoint([step()], { before: { semanticStatus: "before" }, after: { semanticStatus: "after" }, association: { version: 1, before: [REF], after: [REF] } }, OPTIONS);
    const reopened = automationStudioReadJudgeCheckpoint(JSON.parse(JSON.stringify(checkpoint)))!;
    expect(reopened.witnesses?.association).toEqual({ version: 1, before: [REF], after: [REF] });
    const journal = automationStudioAnswerFirstTrailsOf({});
    const trail = journal.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: reopened });
    const current = journal.witnesses(trail, {});
    expect(current.before).toHaveProperty("judgeEvidence");
    expect(current.after).toBeUndefined();
    expect(current.association).toEqual({ version: 1, before: [REF], after: [] });
    for (const invalid of [{ ...REF, callId: "unrelated.call" }, { ...REF, actId: "unrelated.act" }]) {
      const copied = structuredClone(checkpoint);
      copied.witnesses!.association!.after = [invalid];
      expect(automationStudioReadJudgeCheckpoint(copied)).toBeUndefined();
    }
  });

  it("keeps a historical action gap held beside associated generic states; correspondence is no success proof", () => {
    const witness = { version: 1 as const, before: [REF], after: [REF] };
    const shown = automationStudioFlowLessJudgedSummary({ instructions: "Save the requested preference", acts: [{ id: REF.actId, what: "Saved preference", where: "Settings", classes: ["modify_existing"], state: "may_have_landed" }], trail: [step()], witnesses: { before: { status: "ok" }, after: { status: "ok" }, association: witness } }, [], OPTIONS);
    expect(shown.sent.evidenceProjection?.missing).toContainEqual({ source: REF.callId, codes: ["example.action_response_missing"] });
    expect(automationStudioResultVerdict({ summary: shown.read, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
    expect((shown.sent as unknown as { witnesses: { association: unknown } }).witnesses.association).toEqual(witness);
  });

  it("repairs the logical before only from its same exact in-memory input, never a later equal-looking read", () => {
    const original = { preference: false, page: "PRIVATE_STATE_CAPTURE" };
    const first = automationStudioMakeJudgeCheckpoint([], { before: original }, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] });
    const recovered = automationStudioMakeJudgeCheckpoint([], { before: original }, OPTIONS, first);
    expect(recovered.witnesses?.before?.missing).toEqual([]);
    expect(recovered.witnesses?.before?.history).toEqual([{ codes: ["judge_evidence.projector_missing"], by: "original-source" }]);
    expect(JSON.stringify(recovered)).not.toContain("PRIVATE_STATE_CAPTURE");
    const restarted = automationStudioReadJudgeCheckpoint(JSON.parse(JSON.stringify(first)))!;
    const later = automationStudioMakeJudgeCheckpoint([], { before: { ...original } }, OPTIONS, restarted);
    expect(later.witnesses?.before?.missing).toEqual(["judge_evidence.projector_missing"]);
  });
});
