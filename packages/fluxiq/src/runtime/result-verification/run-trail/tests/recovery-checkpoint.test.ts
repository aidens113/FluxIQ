import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../../flow-less/index.ts";
import type { AutomationStudioFlowLessSummary } from "../../flow-less/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioMakeJudgeCheckpoint, automationStudioReadJudgeCheckpoint } from "../checkpoint/index.ts";
import { automationStudioAnswerFirstTrailsOf } from "../../../../framework/automation-service/service/answer-first/trail/index.ts";

const REF = { callId: "actual.call", actId: "actual.act" };
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [], projectJudgeEvidence: () => ({ role: "observation" as const, evidence: { semanticStatus: "current" } }) };
const step = (): AutomationStudioResultTrailStep => ({ did: "actual.update", callId: REF.callId, judgeAct: REF, framework: { effectApplied: true }, judgeEvidence: { version: 1, role: "action", evidence: { control: "Save" }, missing: ["example.action_response_missing"], withheld: true } });

describe("durable source/witness recovery authority", () => {
  it("rejects non-JSON framework metadata without losing known execution facts in a valid checkpoint", () => {
    const checkpoint = automationStudioMakeJudgeCheckpoint([step()], {}, OPTIONS);
    const cycle: { child?: unknown } = {};
    cycle.child = cycle;
    for (const extra of [() => null, 1n, Number.NaN, new Map(), cycle]) {
      const malformed = { ...checkpoint, trail: [{ ...checkpoint.trail[0]!, framework: { effectApplied: true, extra } }] };
      expect(automationStudioReadJudgeCheckpoint(malformed)).toBeUndefined();
    }
    expect(automationStudioReadJudgeCheckpoint(checkpoint)?.trail[0]?.framework).toEqual({ effectApplied: true });
    expect(checkpoint.trail[0]?.judgeEvidence?.missing).toEqual(["example.action_response_missing"]);
  });

  it("carries exact before-input authority only through Core's held wrappers, rescreens successful evidence and loses it on JSON restart", () => {
    const original = { checked: false, newlyPrivate: "OLD_ALLOWED_STATE_CELL", page: "PRIVATE_BEFORE_CAPTURE" };
    const actual = step();
    actual.judgeEvidence = { version: 1, role: "action", evidence: { control: "Save" }, missing: [], withheld: false };
    const journal = automationStudioAnswerFirstTrailsOf({});
    const trail = journal.of("attempt", { carriedOn: false, askedAgain: false });
    trail.push(actual);
    const before = journal.checkpoint(trail, { before: original }, { judgeEvidenceVersion: 1, deniedEvidenceKeys: [] })!;
    let beforeCalls = 0;
    const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
      const value = (input.evidence as JsonObject).evidence as JsonObject;
      if (input.phase === "before") {
        beforeCalls += 1;
        expect(value.checked).toBe(false);
        expect(value.page).toBe("PRIVATE_BEFORE_CAPTURE");
      }
      return { role: "observation", evidence: { checked: value.checked!, newlyPrivate: value.newlyPrivate ?? "CURRENT_ALLOWED_STATE_CELL" } };
    };
    const make = (readings: ReturnType<typeof journal.witnesses>): AutomationStudioFlowLessSummary => ({ instructions: "Save the preference", acts: [{ id: REF.actId, what: "Saved preference", where: "Settings", classes: ["modify_existing"], state: "landed" }], trail, witnesses: readings });
    const first = automationStudioFlowLessJudgedSummary(make(journal.witnesses(trail, { after: { checked: true } })), [], { ...OPTIONS, projectJudgeEvidence: projector });
    expect(first.sent.evidenceProjection?.missing).toEqual([]);
    expect(beforeCalls).toBe(1);
    expect(JSON.stringify(first.sent)).not.toContain("PRIVATE_BEFORE_CAPTURE");
    const screened = automationStudioFlowLessJudgedSummary(make(journal.witnesses(trail, { after: { checked: true } })), ["newlyPrivate"], { ...OPTIONS, projectJudgeEvidence: projector });
    expect(screened.sent.evidenceProjection?.missing).toEqual([]);
    expect(beforeCalls).toBe(1);
    expect(JSON.stringify(screened.sent)).not.toContain("OLD_ALLOWED_STATE_CELL");
    expect(original.newlyPrivate).toBe("OLD_ALLOWED_STATE_CELL");
    const restarted = automationStudioAnswerFirstTrailsOf({});
    const restored = restarted.of("attempt", { carriedOn: true, askedAgain: false, judgeEvidence: automationStudioReadJudgeCheckpoint(JSON.parse(JSON.stringify(before)))! });
    const reopened = automationStudioFlowLessJudgedSummary({ ...make(restarted.witnesses(restored, { after: { checked: true } })), trail: restored }, [], { ...OPTIONS, projectJudgeEvidence: projector });
    expect(reopened.sent.evidenceProjection?.missing).toContainEqual({ source: "witnesses.before", codes: ["judge_evidence.projector_missing"] });
    expect(beforeCalls).toBe(1);
  });

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
