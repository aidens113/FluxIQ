import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioResultTrailStep, AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultRunTrail, automationStudioResultSemanticTrail, automationStudioResultTrailOfAttempts, automationStudioResultTrailOfObservations, automationStudioResultTrailStepOfCall } from "../index.ts";

const ID = "f2ed61ba-712f-4bd9-806f-2309ada68837";
const ROWS: JsonObject[] = Array.from({ length: 1201 }, (_, i) => ({ originalId: ID, title: `Item ${i + 1}`, publishedAt: 1763740800000 + i, elapsedMs: i, values: [null, "2", 2] }));
const RAW = "PRIVATE_RAW_CAPTURE ".repeat(2000);
const FAILURE = { category: "expected_state_missing", code: "example.effect_not_confirmed", retryable: false, stage: "confirmation", effect: "ambiguous", expected: "private comparison", evidenceDigest: "a".repeat(64) };
type Source = "call" | "flow" | "build";

function adapted(source: Source, evidence: JsonObject, projector: AutomationStudioJudgeEvidenceProjector | undefined): AutomationStudioResultTrailStep {
  const semantic = { projectJudgeEvidence: projector, deniedEvidenceKeys: [] };
  if (source === "call") return automationStudioResultTrailStepOfCall({ callId: ID, toolId: "core.run_node", value: { node: "example.action", parameters: { capture: RAW } } }, { kind: "llm_evidence_tool_execution", resultCode: "example.succeeded", effectApplied: true, failure: FAILURE, evidence }, "Example item", semantic);
  if (source === "flow") return automationStudioResultTrailOfAttempts([{ nodeId: "n1", attemptId: ID, definitionId: "example.action", status: "succeeded", route: "success", failure: FAILURE, outputs: evidence, stateRefs: { afterAction: { summary: { page: RAW } } } }], [], ["page"], semantic)[0]!;
  return automationStudioResultTrailOfObservations([{ step: 1, resultCode: "example.succeeded", effectApplied: true, failure: FAILURE, evidence, records: ROWS }], () => "example.action", semantic)[0]!;
}

function summary(step: AutomationStudioResultTrailStep, projector?: AutomationStudioJudgeEvidenceProjector): AutomationStudioRunResultSummary {
  const privateTrail = automationStudioResultRunTrail([step], []).trail;
  const shown = automationStudioResultSemanticTrail(privateTrail, { projectJudgeEvidence: projector, deniedEvidenceKeys: [] });
  return { schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: ROWS.length, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1, recordSets: [{ datasetId: "answer", recordCount: ROWS.length, refusedCount: 0, truncated: false, columns: ["originalId", "title", "publishedAt", "elapsedMs", "values"], columnsWithheld: false, rowsChecked: ROWS.length, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: ROWS }], flowShape: [], withheld: shown.withheld, ...(shown.trail === undefined ? {} : { trail: shown.trail }), evidenceProjection: shown.projection };
}

describe.each(["call", "flow", "build"] as const)("semantic findings through the %s adapter", (source) => {
  it("projects before bookkeeping stripping, keeps every row/value and accepts complete data with captures omitted", () => {
    let calls = 0;
    const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
      calls += 1;
      const envelope = input.evidence as JsonObject;
      const evidence = envelope.evidence as JsonObject;
      expect(evidence.records).toEqual(ROWS);
      return { role: "data", evidence: { records: evidence.records!, account: evidence.account! } };
    };
    const evidence = { records: ROWS, capture: RAW, account: { collected: 1205, repeats: 1, filteredOut: 3, kept: 1201 } };
    const step = adapted(source, evidence, projector);
    const original = structuredClone(step);
    const shown = summary(step, projector);
    const finding = shown.trail!.entries[0]!.found as JsonObject;
    expect((finding.evidence as JsonObject).records).toEqual(ROWS);
    expect((finding.evidence as JsonObject).account).toEqual(evidence.account);
    expect(shown.recordSets[0]!.sampleRows).toEqual(ROWS);
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    expect(JSON.stringify(shown)).not.toContain("PRIVATE_RAW_CAPTURE");
    expect(step).toEqual(original);
    expect(calls).toBe(1);
  });

  it("keeps historical uncertainty as a fact and permits acceptance when current semantic evidence proves the action", () => {
    const projector: AutomationStudioJudgeEvidenceProjector = () => ({ role: "action", evidence: { effectUncertain: "The earlier command did not prove the effect", confirmation: { before: false, after: true, source: "current observed value" } } });
    const shown = summary(adapted(source, { capture: RAW }, projector), projector);
    expect(shown.trail?.entries[0]?.framework?.failure).toEqual({ category: FAILURE.category, code: FAILURE.code, retryable: false, stage: FAILURE.stage, effect: "ambiguous" });
    expect(JSON.stringify(shown)).toContain("The earlier command did not prove the effect");
    expect(JSON.stringify(shown)).not.toContain("PRIVATE_RAW_CAPTURE");
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
  });

  it("holds a genuine gap with no raw fallback while framework failure/effect and stored rows survive", () => {
    const bad: AutomationStudioJudgeEvidenceProjector = () => { throw new Error("raw secret must not enter the finding"); };
    const shown = summary(adapted(source, { capture: RAW }, bad), bad);
    expect(shown.recordSets[0]!.sampleRows).toEqual(ROWS);
    expect(shown.trail?.entries[0]?.framework?.failure).toMatchObject({ code: FAILURE.code, effect: "ambiguous" });
    if (source !== "flow") expect(shown.trail?.entries[0]?.framework?.effectApplied).toBe(true);
    expect(shown.evidenceProjection?.missing).toHaveLength(1);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
    expect(JSON.stringify(shown)).not.toContain("PRIVATE_RAW_CAPTURE");
  });
});
