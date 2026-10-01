// The one door every row of a loop's record goes through (`../trace.ts`): what
// it stamps on each row, and what it remembers between them. The loop-level
// behaviour is held by `./progress.test.ts`; these pin the recorder itself.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceLoopTraceRecorder, type AutomationStudioLlmEvidenceLoopTrace } from "../index.ts";

const answerable = { recordsRequested: true, recordProducerPresent: true, recordStorePresent: false };
const shown = { bytes: 120, budget: 120, steps: 2, instructionBytes: 40 };
const draftChange = { targetedStepIds: ["d1"], appliedCount: 1, refusedCount: 0, keptStepCount: 2 };

describe("the evidence loop's row recorder", () => {
  it("stamps an unremarkable row with its progress and its moment, and nothing it did not observe", () => {
    const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
    const rows = automationStudioLlmEvidenceLoopTraceRecorder(trace);
    const before = Date.now();
    rows.record({ iteration: 1, decision: "tool_call", callId: "c1", toolId: "look" });
    expect(trace).toHaveLength(1);
    const [row] = trace;
    expect(row).toEqual({
      iteration: 1, decision: "tool_call", callId: "c1", toolId: "look",
      progress: { draftRevisionBefore: 0, draftRevisionAfter: 0, pageState: "unobserved", draftState: "unchanged", answerabilityState: "unobserved" },
      at: row!.at
    });
    expect(row!.at).toBeGreaterThanOrEqual(before);
    expect(row!.at).toBeLessThanOrEqual(Date.now());
  });

  it("counts a revision for every row that changed the draft, and carries the page's state", () => {
    const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
    const rows = automationStudioLlmEvidenceLoopTraceRecorder(trace);
    rows.record({ iteration: 1, decision: "tool_call" }, { draftChanged: true, pageState: "changed" });
    rows.record({ iteration: 2, decision: "tool_call" }, { pageState: "unchanged" });
    rows.record({ iteration: 3, decision: "amend_draft" }, { draftChanged: true, draftChange });
    expect(trace.map((row) => row.progress)).toEqual([
      { draftRevisionBefore: 0, draftRevisionAfter: 1, pageState: "changed", draftState: "changed", answerabilityState: "unobserved" },
      { draftRevisionBefore: 1, draftRevisionAfter: 1, pageState: "unchanged", draftState: "unchanged", answerabilityState: "unobserved" },
      { draftRevisionBefore: 1, draftRevisionAfter: 2, pageState: "unobserved", draftState: "changed", answerabilityState: "unobserved" }
    ]);
    expect(trace[2]!.draftChange).toEqual(draftChange);
    expect(trace[0]).not.toHaveProperty("draftChange");
    expect(rows.draftRevision).toBe(2);
  });

  it("compares each observed answerability with the last one observed, across rows that observed none", () => {
    const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
    const rows = automationStudioLlmEvidenceLoopTraceRecorder(trace);
    rows.record({ iteration: 1, decision: "complete" }, { answerability: answerable });
    rows.record({ iteration: 2, decision: "tool_call" });
    rows.record({ iteration: 3, decision: "complete" }, { answerability: { ...answerable } });
    rows.record({ iteration: 4, decision: "complete" }, { answerability: { ...answerable, issueCode: "bootstrap.cannot_answer_instruction" } });
    expect(trace.map((row) => row.progress!.answerabilityState)).toEqual(["first_observed", "unobserved", "unchanged", "changed"]);
    expect(trace.map((row) => row.answerability)).toEqual([answerable, undefined, answerable, { ...answerable, issueCode: "bootstrap.cannot_answer_instruction" }]);
    expect(rows.answerability).toEqual({ ...answerable, issueCode: "bootstrap.cannot_answer_instruction" });
  });

  it("stamps the draft the current decision was shown on every row until it is cleared, even handed on detached", () => {
    const trace: AutomationStudioLlmEvidenceLoopTrace[] = [];
    const rows = automationStudioLlmEvidenceLoopTraceRecorder(trace);
    const record = rows.record;
    record({ iteration: 0, decision: "tool_call" });
    rows.draftShown = shown;
    record({ iteration: 1, decision: "tool_call" });
    record({ iteration: 1, decision: "unusable" });
    rows.draftShown = undefined;
    record({ iteration: 2, decision: "tool_call" });
    expect(trace.map((row) => row.draft)).toEqual([undefined, shown, shown, undefined]);
    expect("draft" in trace[0]!).toBe(false);
  });
});
