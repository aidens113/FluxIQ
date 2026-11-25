// Core's own note on a before side it holds no reading from before for is Core's, never page state (t1043).
//
// Run `run-mww6euuw-ecdb20f8`: attempt 1 made an undeclared press its answer said changed a line, so the act was carried
// into attempt 2 with no reading from before it, and attempt 2's before side was Core's note. The note went through the
// web projector as page state, which named it `web_judge.evidence_unrecognized`; Core held every yes unsure, and no act
// or read could clear it. The projector here refuses anything it does not know, as the web one does.
import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import type { AutomationStudioRunResultSummary } from "../../contracts/index.ts";
import { automationStudioMakeJudgeCheckpoint, automationStudioResultRunTrail, automationStudioResultTrailStepOfCall } from "../../run-trail/index.ts";
import { automationStudioResultVerdict } from "../../verdict/index.ts";
import { AUTOMATION_STUDIO_JUDGE_EARLIER_BEFORE_WORDS as WORDS, automationStudioProjectJudgeEvidence, automationStudioResultJudgeSummary } from "../index.ts";

const ROWS = [{ title: "Atlas of Rivers", due: "2030-01-01" }];
const OPTIONS = { judgeEvidenceVersion: 1 as const, deniedEvidenceKeys: [] };

/** What the projector was handed, to prove Core's note never reaches it. */
function strictProjector(): { projector: AutomationStudioJudgeEvidenceProjector; seen: unknown[] } {
  const seen: unknown[] = [];
  const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
    const evidence = (input.evidence as JsonObject).evidence as JsonObject;
    seen.push(evidence);
    if (input.source === "state") return evidence.shelf === undefined ? { role: "observation", missing: ["example.evidence_unrecognized"] } : { role: "observation", evidence: { shelf: evidence.shelf } };
    return evidence.read === undefined ? { role: "observation", missing: ["example.evidence_unrecognized"] } : { role: "data", evidence: { observedRows: ROWS.length } };
  };
  return { projector, seen };
}

/** A summary whose one act was carried, undeclared, from an earlier attempt, and whose before side is `before`. */
function carried(before: JsonObject, projector: AutomationStudioJudgeEvidenceProjector): AutomationStudioRunResultSummary {
  const step = automationStudioResultTrailStepOfCall({ callId: "call.read", toolId: "core.run_node", value: { node: "example.read", consequences: [] } }, { kind: "llm_evidence_tool_execution", evidence: { read: { extracted: ROWS } }, resultCode: "example.succeeded", effectApplied: false }, undefined, { ...OPTIONS, projectJudgeEvidence: projector });
  const summary = {
    schemaVersion: "automation-studio.run-result-summary.v1", totalRecordCount: 1, totalRefusedCount: 0, totalRowsMissingRequired: 0, recordSetCount: 1,
    recordSets: [{ datasetId: "answer", recordCount: 1, refusedCount: 0, truncated: false, columns: ["title", "due"], columnsWithheld: false, rowsChecked: 1, rowsMissingRequired: 0, missingRequiredColumns: [], sampleRows: ROWS }],
    flowShape: [], withheld: false,
    trail: automationStudioResultRunTrail([step], []).trail!,
    acts: [{ id: "act.press", what: "Already done earlier: Accept", where: "On the site", classes: [], state: "may_have_landed" }],
    witnesses: { before, after: { shelf: "open" } }
  };
  return summary as unknown as AutomationStudioRunResultSummary;
}

describe("Core's note on a before side it holds no reading from before for", () => {
  it("reaches the judge in Core's words, never through the host's projector, and a yes is confirmed", () => {
    const { projector, seen } = strictProjector();
    const shown = automationStudioResultJudgeSummary(carried({ note: WORDS.notHeld }, projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect((shown as unknown as { witnesses: JsonObject }).witnesses.before).toEqual({ role: "observation", evidence: { note: WORDS.notHeld } });
    expect(JSON.stringify(seen)).not.toContain(WORDS.notHeld);
    expect(automationStudioResultVerdict({ summary: shown, basis: "model", diagnosis: { answersRequest: "yes" } }).verdict).toBe("answers");
  });

  it("hands only the reading beside it to the host, as page state, and keeps Core's words beside the finding", () => {
    const { projector, seen } = strictProjector();
    const shown = automationStudioResultJudgeSummary(carried({ note: WORDS.takenAfter, reading: { shelf: "held" } }, projector), { ...OPTIONS, projectJudgeEvidence: projector });
    expect(shown.evidenceProjection?.missing).toEqual([]);
    expect((shown as unknown as { witnesses: JsonObject }).witnesses.before).toEqual({ role: "observation", evidence: { note: WORDS.takenAfter, reading: { shelf: "held" } } });
    expect(seen).toContainEqual({ shelf: "held" });
    expect(JSON.stringify(seen)).not.toContain(WORDS.takenAfter);
  });

  it("is kept the same way in the attempt's semantic checkpoint, which a resume reopens", () => {
    const { projector, seen } = strictProjector();
    const checkpoint = automationStudioMakeJudgeCheckpoint([], { before: { note: WORDS.notHeld }, after: { shelf: "open" } }, { ...OPTIONS, projectJudgeEvidence: projector });
    expect(checkpoint.witnesses?.before).toEqual({ version: 1, role: "observation", evidence: { note: WORDS.notHeld }, missing: [], withheld: false });
    expect(JSON.stringify(seen)).not.toContain(WORDS.notHeld);
  });

  it("is only Core's exact words: a page value that merely has a note is page state, and goes to the host", () => {
    const { projector, seen } = strictProjector();
    const page = { note: "Pickup today" };
    expect(automationStudioProjectJudgeEvidence({ source: "state", phase: "before", evidence: { evidence: page } }, projector, [])).toEqual({ role: "observation", missing: ["example.evidence_unrecognized"], withheld: true });
    expect(automationStudioProjectJudgeEvidence({ source: "state", phase: "before", evidence: { evidence: { note: WORDS.notHeld, extra: 1 } } }, projector, []).missing).toEqual(["example.evidence_unrecognized"]);
    expect(seen).toEqual([page, { note: WORDS.notHeld, extra: 1 }]);
  });
});
