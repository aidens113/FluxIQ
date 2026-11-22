import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioResultTrailStep, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioMakeJudgeCheckpoint, automationStudioReadJudgeCheckpoint, automationStudioResultRunTrail } from "../../run-trail/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultJudgeSummary } from "../summary.ts";

const OLD = { source: "read.old", step: "kept.read", version: 1, datasetId: "dataset.old" };
const NEW = { source: "read.new", step: "kept.read", version: 1, datasetId: "dataset.new" };
const ROWS = [{ id: "original.uuid", price: "$2.00", count: 2, marked: false, values: [null, "2", 2] }];
const ACCOUNT = { collected: 3, leftOut: 1, repeats: 1, cut: 0, kept: 1, filters: [{ condition: "not marked", leftOut: 1, leftOutOnlyByThis: ["Actual excluded row"] }] };
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [], projectJudgeEvidence: () => ({ role: "data" as const, evidence: { rows: 1 } }) };
const gap = (): AutomationStudioResultTrailStep => ({ did: "read", callId: "read.old", judgeSources: [OLD], framework: { effectApplied: false }, judgeEvidence: { version: 1, role: "data", evidence: { observedRows: 1 }, missing: ["example.schema_missing"], withheld: true } });
const receipt = { version: 1, receipts: [{ kind: "page", from: [OLD], to: [NEW] }] };

function summary(steps: AutomationStudioResultTrailStep[], replacement: unknown = receipt, page: unknown = NEW): AutomationStudioRunResultSummary {
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "answer", recordCount: 1, refusedCount: 0, truncated: false, columns: Object.keys(ROWS[0]!), columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: ROWS }], flowShape: [], withheld: false, trail: automationStudioResultRunTrail(steps, []).trail!, resultEvidence: { pages: [{ ...(page as JsonObject), invalidCount: 0, rows: ROWS }], sourceReplacements: replacement, processing: ACCOUNT } as JsonObject };
}

describe("producer-owned exact source replacement recovery", () => {
  it.each(["judge_evidence.projector_missing", "judge_evidence.projection_failed"])("keeps a generic historical %s role unknown while checkpointing a neutral exact-source repair fact", (code) => {
    const original = gap();
    original.judgeEvidence = { version: 1, missing: [code], withheld: true };
    const input = summary([original]);
    const shown = automationStudioResultJudgeSummary(input, OPTIONS);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(shown.trail?.entries[0]?.found).toMatchObject({ role: "observation", evidence: { sourceEvidence: "replaced" }, history: [{ codes: [code], by: "source-replacement" }] });
    const checkpoint = automationStudioMakeJudgeCheckpoint([original], {}, { ...OPTIONS, resultEvidence: input.resultEvidence });
    const reopened = automationStudioReadJudgeCheckpoint(JSON.parse(JSON.stringify(checkpoint)))!;
    expect(reopened).toBeDefined();
    expect(reopened.trail[0]?.judgeEvidence).toMatchObject({ role: "observation", evidence: { sourceEvidence: "replaced" }, missing: [] });
    expect(original.judgeEvidence.role).toBeUndefined();
    expect(original.judgeEvidence.missing).toEqual([code]);
  });

  it("keeps historical codes and every original row/account while resolving the corresponding current gap, including checkpoint and JSON reopen", () => {
    const steps = [gap()];
    const original = summary(steps);
    const before = structuredClone(original);
    const shown = automationStudioResultJudgeSummary(original, OPTIONS);
    expect(shown.recordSets).toEqual(original.recordSets);
    expect(shown.resultEvidence).toEqual(original.resultEvidence);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(shown.trail?.entries[0]?.found).toMatchObject({ history: [{ codes: ["example.schema_missing"], by: "source-replacement" }] });
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    const checkpoint = automationStudioMakeJudgeCheckpoint(steps, {}, { ...OPTIONS, resultEvidence: original.resultEvidence });
    const reopened = automationStudioReadJudgeCheckpoint(JSON.parse(JSON.stringify(checkpoint)))!;
    expect(reopened.trail[0]?.judgeEvidence?.missing).toEqual([]);
    expect(reopened.trail[0]?.judgeEvidence?.history).toEqual([{ codes: ["example.schema_missing"], by: "source-replacement" }]);
    const twice = automationStudioResultJudgeSummary(JSON.parse(JSON.stringify(shown)), OPTIONS);
    expect(twice.evidenceProjection?.missing).toEqual([]);
    expect(twice.trail).toEqual(shown.trail);
    expect(original).toEqual(before);
  });

  it.each([null, { version: 2, receipts: [] }, { ...receipt, guessed: true }])("rejects absent/malformed authority %j", (metadata) => {
    const shown = automationStudioResultJudgeSummary(summary([gap()], metadata), OPTIONS);
    expect(shown.evidenceProjection?.missing).toContainEqual({ source: "read.old", codes: ["example.schema_missing"] });
  });

  it("keeps the gap when no replacement authority was stored", () => {
    const original = summary([gap()]);
    delete original.resultEvidence!.sourceReplacements;
    expect(automationStudioResultJudgeSummary(original, OPTIONS).evidenceProjection?.missing).toHaveLength(1);
  });

  it.each([{ ...OLD, step: "different" }, { ...OLD, version: 2 }, { ...OLD, datasetId: "different" }, { ...OLD, source: "different" }])("does not match the historical tuple approximately %j", (from) => {
    const shown = automationStudioResultJudgeSummary(summary([gap()], { version: 1, receipts: [{ kind: "page", from: [from], to: [NEW] }] }), OPTIONS);
    expect(shown.evidenceProjection?.missing).toHaveLength(1);
  });

  it("requires every chain target to remain actual and known-valid, not a later unrelated page", () => {
    const middle = { ...NEW, source: "read.middle" };
    const chain = { version: 1, receipts: [{ kind: "page", from: [OLD], to: [middle] }, { kind: "page", from: [middle], to: [NEW] }] };
    expect(automationStudioResultJudgeSummary(summary([gap()], chain), OPTIONS).evidenceProjection?.missing).toEqual([]);
    expect(automationStudioResultJudgeSummary(summary([gap()], chain, { ...NEW, source: "unrelated" }), OPTIONS).evidenceProjection?.missing).toHaveLength(1);
    const invalid = summary([gap()]);
    (invalid.resultEvidence!.pages as JsonObject[])[0]!.invalidCount = 1;
    expect(automationStudioResultJudgeSummary(invalid, OPTIONS).evidenceProjection?.missing).toHaveLength(1);
  });

  it("keeps all indistinguishably reused journal occurrences held even if the receipt is valid", () => {
    const earlier = gap();
    const later = { ...gap(), callId: "another.actual.call" };
    const shown = automationStudioResultJudgeSummary(summary([earlier, later]), OPTIONS);
    expect(shown.evidenceProjection?.missing).toHaveLength(2);
    expect(shown.trail?.entries.every((step) => (step.found as JsonObject).history === undefined)).toBe(true);
  });

  it("does not let data receipts erase a lasting or uncertain mixed effect, even beside linked generic before/after views", () => {
    for (const framework of [{ effectApplied: true }, { effectApplied: false, failure: { category: "expected_state_missing", code: "example.uncertain", retryable: false, stage: "confirmation", effect: "ambiguous" } }]) {
      for (const linked of [false, true]) {
        const step = { ...gap(), framework, ...(linked ? { judgeAct: { callId: "read.old", actId: "actual.act" } } : {}) };
        const original = summary([step]);
        const shown = automationStudioResultJudgeSummary({ ...original, startView: { view: { status: "before" } }, endView: { view: { status: "after" } } }, OPTIONS);
        expect(shown.evidenceProjection?.missing).toContainEqual({ source: "read.old", codes: ["example.schema_missing"] });
        expect(shown.trail?.entries[0]?.framework?.effectApplied).toBe(framework.effectApplied);
        if (framework.failure !== undefined) expect((shown.trail?.entries[0]?.framework?.failure as JsonObject).effect).toBe("ambiguous");
        expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
      }
    }
  });
});
