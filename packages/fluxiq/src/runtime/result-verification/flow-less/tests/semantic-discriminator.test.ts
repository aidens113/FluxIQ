import { expect, it } from "vitest";
import type { AutomationStudioResultTrailStep } from "../../contracts/index.ts";
import { automationStudioFlowLessJudgedSummary } from "../judged-summary.ts";

it("preserves an explicitly rejected finding through the real Flow-less builder without a raw legacy fallback", () => {
  for (const judgeEvidence of [undefined, null, { version: 2, role: "observation", evidence: {}, missing: [], withheld: false }]) {
    const step = { did: "example.observe", found: { page: "PRIVATE_CAPTURE_SENTINEL" }, judgeEvidence } as unknown as AutomationStudioResultTrailStep;
    const summary = { instructions: "Read the original record", acts: [], rows: { totalRows: 1, truncated: false, columns: [{ id: "name", label: "Name" }], rows: [{ name: "Original" }] }, trail: [step] };
    let calls = 0;
    for (const semantic of [undefined, { projectJudgeEvidence: () => { calls += 1;
      return { role: "observation" as const, evidence: {} }; } }]) {
      const shown = automationStudioFlowLessJudgedSummary(summary, [], semantic).sent;
      expect(shown.evidenceProjection?.missing.flatMap((gap) => gap.codes)).toContain("judge_evidence.finding_invalid");
      expect(shown.recordSets[0]?.sampleRows).toEqual(summary.rows.rows);
      expect(JSON.stringify(shown)).not.toContain("PRIVATE_CAPTURE_SENTINEL");
    }
    expect(calls).toBe(0);
  }
});

it("keeps true legacy absence compatible without treating a new optional callback alone as an opt-in", () => {
  const summary = { instructions: "Read the original record", acts: [], trail: [{ did: "example.observe", found: { page: "LEGACY_CAPTURE" } }] };
  const legacy = automationStudioFlowLessJudgedSummary(summary, []).sent;
  const withOptionalCallback = automationStudioFlowLessJudgedSummary(summary, [], { projectJudgeEvidence: () => { throw new Error("legacy must not project"); } }).sent;
  expect(withOptionalCallback).toEqual(legacy);
  expect(legacy).not.toHaveProperty("evidenceProjection");
  expect(JSON.stringify(legacy)).toContain("LEGACY_CAPTURE");
});
