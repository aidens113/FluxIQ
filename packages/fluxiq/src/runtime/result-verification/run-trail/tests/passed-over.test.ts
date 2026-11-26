// A step the saved Flow's routing passed over is Core's own record, never page evidence (t1053).
//
// Run `run-mwwwf7pb-c646fefb`: attempt 2 ran the saved Flow, its cover steps were passed over (their targets were gone),
// the judge said yes, and the web projector named each passed-over step a gap, so every yes was held unsure.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { AUTOMATION_STUDIO_JUDGE_PASSED_OVER_WORDS as WORDS, automationStudioResultJudgeSummary } from "../../judge-evidence/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { automationStudioResultRunTrail, automationStudioResultTrailOfAttempts } from "../index.ts";

const ROWS: JsonObject[] = [{ name: "Row one" }, { name: "Row two" }];
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] };
const SKIPPED = { reason: "target_absent", code: "executor.ready_state.not_shown", notDone: true };
const NODES = [{ id: "n2", label: "Accept all" }, { id: "n3", label: "Open list" }, { id: "n4", label: "Read list" }];

/** Like the web projector: it knows data and action findings, and names anything else a gap. */
function strict(seen: unknown[]): AutomationStudioJudgeEvidenceProjector {
  return (input) => {
    const evidence = (input.evidence as JsonObject).evidence as JsonObject;
    seen.push(input.on);
    if (evidence.rows !== undefined) return { role: "data", evidence: { rows: evidence.rows } };
    if (evidence.pressed !== undefined) return { role: "observation", evidence: { pressed: evidence.pressed } };
    return { role: "observation", missing: ["example.evidence_unrecognized"] };
  };
}

function summaryOf(attempts: Parameters<typeof automationStudioResultTrailOfAttempts>[0], projector: AutomationStudioJudgeEvidenceProjector): AutomationStudioRunResultSummary {
  const steps = automationStudioResultTrailOfAttempts(attempts, NODES, [], { ...OPTIONS, projectJudgeEvidence: projector });
  return {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 2, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "answer", recordCount: 2, refusedCount: 0, truncated: false, columns: ["name"], columnsWithheld: false, rowsChecked: 2, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: ROWS }],
    flowShape: [], withheld: false, trail: automationStudioResultRunTrail(steps, []).trail!
  } as unknown as AutomationStudioRunResultSummary;
}

const PASSED = { nodeId: "n2", attemptId: "a2", definitionId: "example.press", status: "succeeded", route: "skipped", skipped: SKIPPED };
const OPENED = { nodeId: "n3", attemptId: "a3", definitionId: "example.press", status: "succeeded", route: "success", outputs: { pressed: "Open list" } };
const READ = { nodeId: "n4", attemptId: "a4", definitionId: "example.read", status: "succeeded", route: "success", outputs: { rows: ROWS } };

describe("a step the saved Flow's routing passed over", () => {
  it("raises no gap, and the judge's yes stands", () => {
    const seen: unknown[] = [];
    const projector = strict(seen);
    const shown = automationStudioResultJudgeSummary(summaryOf([PASSED, { ...PASSED, nodeId: "n5", attemptId: "a5" }, OPENED, READ], projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
    // The host never saw the passed-over steps; it saw only the two that ran.
    expect(seen).toEqual(["Open list", "Read list"]);
  });

  it("is named to the judge in Core's words, with the step, that it was passed over, and why", () => {
    const projector = strict([]);
    const shown = automationStudioResultJudgeSummary(summaryOf([PASSED, READ], projector), { ...OPTIONS, projectJudgeEvidence: projector });
    const entry = shown.trail!.entries[0]!;
    expect(entry.on).toBe("Accept all");
    expect(entry.outcome).toContain("passed over");
    expect(entry.found).toEqual({ role: "observation", evidence: { note: WORDS.targetAbsent } });
    expect(entry.framework?.skipped).toMatchObject({ reason: "target_absent" });
  });

  it("says plainly when routing passed it over for another reason", () => {
    const projector = strict([]);
    const shown = automationStudioResultJudgeSummary(summaryOf([{ ...PASSED, skipped: true }, READ], projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.trail!.entries[0]!.found).toEqual({ role: "observation", evidence: { note: WORDS.routed } });
    expect(shown.evidenceProjection?.missing).toEqual([]);
  });
});

describe("a step that ran", () => {
  it("still raises its gap when it produced nothing the host recognizes", () => {
    const projector = strict([]);
    const ranEmpty = { nodeId: "n3", attemptId: "a3", definitionId: "example.press", status: "succeeded", route: "success", outputs: { unknown: 1 } };
    const shown = automationStudioResultJudgeSummary(summaryOf([PASSED, ranEmpty, READ], projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.evidenceProjection?.missing).toEqual([{ source: "n:2", codes: ["example.evidence_unrecognized"] }]);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("unsure");
  });

  it("still raises its gap when it failed with no outputs, even if it also carries a skip", () => {
    const projector = strict([]);
    const failed = { nodeId: "n3", attemptId: "a3", definitionId: "example.press", status: "failed", route: "failure", skipped: SKIPPED, failure: { code: "example.failed" } };
    const shown = automationStudioResultJudgeSummary(summaryOf([failed, READ], projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.evidenceProjection?.missing).toHaveLength(1);
  });
});
