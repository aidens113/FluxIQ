import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioJudgeEvidenceCapability, type AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultRunTrail, automationStudioResultTrailOfAttempts, automationStudioResultTrailOfObservations, automationStudioResultTrailStepOfCall } from "../../run-trail/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultJudgeSummary } from "../summary.ts";

const RAW = "OMITTED_RAW_CAPTURE ".repeat(12000);
const ROWS = [{ id: "f2ed61ba-712f-4bd9-806f-2309ada68837", amount: 2, time: 1763740800000, newlyPrivate: "old allowed cell", values: [null, "2", 2] }];
const ACCOUNT = { collected: 4, duplicates: 1, filteredOut: 2, kept: 1, comparisons: [{ original: "$2.00", parsed: 2 }] };
const FAILURE = { category: "expected_state_missing", code: "example.uncertain", retryable: false, stage: "confirmation", effect: "ambiguous" };
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] };

const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
  const evidence = (input.evidence as JsonObject).evidence as JsonObject;
  if (input.source === "state") return evidence.proof === undefined ? { role: "observation", missing: ["example.current_state_missing"] } : { role: "observation", evidence: { proof: evidence.proof } };
  return { role: evidence.action === true ? "action" : "data", evidence: { observedRows: 1 } };
};

function base(): AutomationStudioRunResultSummary {
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "answer", recordCount: 1, refusedCount: 0, truncated: false, columns: Object.keys(ROWS[0]!), columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: ROWS }], flowShape: [], withheld: false, resultEvidence: { pages: [{ nodeId: "read", batchKey: "first", rows: ROWS, invalidCount: 0 }], processing: ACCOUNT }, startView: { view: { page: RAW, proof: false } }, endView: { view: { page: RAW, proof: true } } };
}

type Source = "call" | "flow" | "build";
function actualTrail(source: Source, action: boolean, facts: { effectApplied?: boolean; failure?: typeof FAILURE; consequences?: string[] } = {}) {
  const evidence = { page: RAW, action, read: { extracted: ROWS } };
  const options = { ...OPTIONS, projectJudgeEvidence: projector };
  if (source === "call") return automationStudioResultRunTrail([automationStudioResultTrailStepOfCall({ callId: "call.1", toolId: "core.run_node", value: { node: "example.read", ...(facts.consequences === undefined ? {} : { consequences: facts.consequences }) } }, { kind: "llm_evidence_tool_execution", evidence, resultCode: "example.succeeded", ...facts }, undefined, options)], []).trail!;
  if (source === "flow") return automationStudioResultRunTrail(automationStudioResultTrailOfAttempts([{ nodeId: "read", attemptId: "call.1", outputs: evidence, status: "succeeded", ...(facts.effectApplied === undefined ? {} : { effectApplied: facts.effectApplied }), ...(facts.failure === undefined ? {} : { failure: facts.failure }) }], [{ id: "read", metadata: facts.consequences === undefined ? {} : { declaredConsequences: facts.consequences } }], ["page"], options), []).trail!;
  return automationStudioResultRunTrail(automationStudioResultTrailOfObservations([{ step: 1, evidence, records: ROWS, resultCode: "example.succeeded", ...facts }], () => "example.read", options), []).trail!;
}

describe.each(["call", "flow", "build"] as const)("the common %s request copy", (source) => {
  it("keeps complete rows/accounts, omits captures without inventing a gap, and measures the actual serialized copy", () => {
    const original = { ...base(), trail: actualTrail(source, false, { effectApplied: false }) };
    const before = structuredClone(original);
    const shown = automationStudioResultJudgeSummary(original, { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.recordSets).toEqual(original.recordSets);
    expect(shown.resultEvidence).toEqual(original.resultEvidence);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(shown).not.toHaveProperty("startView");
    expect(shown).not.toHaveProperty("endView");
    expect(JSON.stringify(shown)).not.toContain("OMITTED_RAW_CAPTURE");
    expect(original).toEqual(before);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    const oldBytes = Buffer.byteLength(JSON.stringify(original));
    const newBytes = Buffer.byteLength(JSON.stringify(shown));
    expect(newBytes).toBeLessThan(oldBytes);
    console.info(`[semantic ${source}] originalBytes=${oldBytes} projectedBytes=${newBytes} rows=${ROWS.length} accountBytes=${Buffer.byteLength(JSON.stringify(ACCOUNT))}`);
  });

  it("preserves a proven action and its before/after findings with no raw capture", () => {
    const original = { ...base(), trail: actualTrail(source, true, { effectApplied: true, consequences: ["update"] }) };
    const shown = automationStudioResultJudgeSummary(original, { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.startView?.view).toEqual({ role: "observation", evidence: { proof: false } });
    expect(shown.endView?.view).toEqual({ role: "observation", evidence: { proof: true } });
    expect(shown.trail?.entries[0]?.framework?.effectApplied).toBe(true);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    expect(JSON.stringify(shown)).not.toContain("OMITTED_RAW_CAPTURE");
  });

  it.each([undefined, [] as string[], ["update"]])("requires real witnesses for a data-role mixed action with consequences %j", (consequences) => {
    for (const facts of [{ effectApplied: true }, { effectApplied: false, failure: FAILURE }]) {
      const original = { ...base(), trail: actualTrail(source, false, { ...facts, ...(consequences === undefined ? {} : { consequences }) }) };
      const shown = automationStudioResultJudgeSummary(original, { ...OPTIONS, projectJudgeEvidence: projector });
      expect(shown.startView?.view).toEqual({ role: "observation", evidence: { proof: false } });
      expect(shown.endView?.view).toEqual({ role: "observation", evidence: { proof: true } });
      expect(shown.recordSets).toEqual(original.recordSets);
      expect(shown.evidenceProjection?.missing).toEqual([]);
      const { startView: _before, endView: _after, ...missing } = original;
      const gap = automationStudioResultJudgeSummary(missing, { ...OPTIONS, projectJudgeEvidence: projector });
      expect(gap.evidenceProjection?.missing).toContainEqual({ source: "witnesses.before", codes: ["judge_evidence.before_state_missing"] });
      expect(gap.evidenceProjection?.missing).toContainEqual({ source: "witnesses.after", codes: ["judge_evidence.after_state_missing"] });
      expect(automationStudioResultVerdict({ summary: gap, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
    }
  });
});

describe("explicit compatibility and semantic reopen", () => {
  it("leaves untagged generic bindings on their legacy path, but refuses every explicitly invalid opt-in", () => {
    const original = base();
    expect(automationStudioResultJudgeSummary(original, { deniedEvidenceKeys: [], projectJudgeEvidence: projector })).toBe(original);
    expect(automationStudioJudgeEvidenceCapability(undefined)).toEqual({});
    expect(automationStudioJudgeEvidenceCapability({})).toEqual({});
    for (const version of [undefined, null, 0, 2, "1"]) {
      const host = { judgeEvidenceVersion: version } as unknown as { judgeEvidenceVersion: 1 };
      expect(Object.hasOwn(automationStudioJudgeEvidenceCapability(host), "judgeEvidenceVersion")).toBe(true);
      const shown = automationStudioResultJudgeSummary(original, { deniedEvidenceKeys: [], projectJudgeEvidence: projector, ...automationStudioJudgeEvidenceCapability(host) });
      expect(shown.evidenceProjection?.missing).toContainEqual({ source: "binding", codes: ["judge_evidence.version_invalid"] });
      expect(JSON.stringify(shown)).not.toContain("OMITTED_RAW_CAPTURE");
    }
  });

  it("reopens shown findings without a second projection, rescreens current exclusions, and still enforces the capability after restart", () => {
    const first = automationStudioResultJudgeSummary({ ...base(), trail: actualTrail("call", true, { effectApplied: true }) }, { ...OPTIONS, projectJudgeEvidence: projector });
    const stored: AutomationStudioRunResultSummary = JSON.parse(JSON.stringify(first));
    const original = structuredClone(stored);
    let calls = 0;
    const reopened = automationStudioResultJudgeSummary(stored, { deniedEvidenceKeys: ["newlyPrivate"], projectJudgeEvidence: () => { calls += 1; throw new Error("a shown finding must not be projected again"); } });
    expect(calls).toBe(0);
    expect(reopened.trail).toEqual(first.trail);
    expect(reopened.startView).toEqual(first.startView);
    expect(reopened.endView).toEqual(first.endView);
    expect(reopened.evidenceProjection?.missing).toEqual([]);
    expect(JSON.stringify(reopened)).not.toContain("old allowed cell");
    expect(stored).toEqual(original);
    const absent = automationStudioResultJudgeSummary(stored, { deniedEvidenceKeys: [] });
    expect(absent.recordSets).toEqual(first.recordSets);
    expect(absent.evidenceProjection?.missing).toContainEqual({ source: "binding", codes: ["judge_evidence.projector_missing"] });
    expect(automationStudioResultVerdict({ summary: absent, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
    const unknown = automationStudioResultJudgeSummary(stored, { deniedEvidenceKeys: undefined, projectJudgeEvidence: projector });
    expect(unknown.recordSets).toEqual([]);
    expect(unknown.evidenceProjection?.missing).toContainEqual({ source: "binding", codes: ["judge_evidence.denied_keys_missing"] });
    expect(JSON.stringify(unknown)).not.toContain("old allowed cell");
  });

  it("does not treat an explicitly malformed stored discriminator as legacy or project its raw payload", () => {
    let calls = 0;
    for (const evidenceProjection of [null, { version: 2, missing: [] }, { version: 1, missing: "bad" }]) {
      const stored = { ...base(), evidenceProjection } as unknown as AutomationStudioRunResultSummary;
      const shown = automationStudioResultJudgeSummary(stored, { deniedEvidenceKeys: [], projectJudgeEvidence: () => { calls += 1; return { role: "observation", evidence: {} }; } });
      expect(shown.evidenceProjection?.missing).toContainEqual({ source: "binding", codes: ["judge_evidence.version_invalid"] });
      expect(JSON.stringify(shown)).not.toContain("OMITTED_RAW_CAPTURE");
    }
    expect(calls).toBe(0);
  });
});
