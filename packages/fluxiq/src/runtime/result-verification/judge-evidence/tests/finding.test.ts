import { describe, expect, it } from "vitest";
import { automationStudioJudgeEvidenceFinding, automationStudioProjectJudgeEvidence } from "../index.ts";
import type { AutomationStudioJudgeEvidenceFinding } from "../index.ts";

describe("a durable semantic finding", () => {
  it("survives spread, structuredClone and JSON reopen without re-projecting or losing semantic values", () => {
    let calls = 0;
    const projected = automationStudioProjectJudgeEvidence({ source: "call", evidence: { capture: "raw capture deliberately omitted" } }, () => {
      calls += 1;
      return { role: "action", evidence: { control: "Save", effectUncertain: "The command answered; its effect has not been read yet.", originalId: "f2ed61ba-712f-4bd9-806f-2309ada68837", changedAt: 1763740800000, amount: 2, values: [null, "2", 2] } };
    }, []);
    const durable: AutomationStudioJudgeEvidenceFinding = { version: 1, ...projected };
    const reopened: unknown = JSON.parse(JSON.stringify(structuredClone({ ...durable })));
    const result = automationStudioJudgeEvidenceFinding(reopened, []);
    expect(result).toEqual({ ok: true, finding: durable });
    expect(calls).toBe(1);
    expect(JSON.stringify(reopened)).not.toContain("raw capture deliberately omitted");
  });

  it("applies current denied keys again and leaves the checkpoint/private evidence unchanged", () => {
    const original = { version: 1, role: "observation", evidence: { state: "saved", newlyPrivate: "old allowed semantic cell", nested: [{ newlyPrivate: "another old cell", amount: 3 }] }, missing: [], withheld: false };
    const before = structuredClone(original);
    const read = automationStudioJudgeEvidenceFinding(original, ["newlyPrivate"]);
    expect(read.ok).toBe(true);
    if (!read.ok) throw new Error("valid finding refused");
    expect(read.finding.evidence).toEqual({ state: "saved", withheld: "(withheld)", nested: [{ withheld: "(withheld)", amount: 3 }] });
    expect(read.finding.missing).toEqual([]);
    expect(read.finding.withheld).toBe(true);
    expect(original).toEqual(before);
  });

  it("retains a missing/throwing projection as a gap and a known empty data result as complete", () => {
    const missing = { version: 1, ...automationStudioProjectJudgeEvidence({ source: "call", evidence: {} }, undefined, []) };
    expect(automationStudioJudgeEvidenceFinding(JSON.parse(JSON.stringify(missing)), [])).toEqual({ ok: true, finding: missing });
    const empty = { version: 1, role: "data", evidence: { source: "read.1", kept: 0 }, missing: [], withheld: false };
    expect(automationStudioJudgeEvidenceFinding(empty, [])).toEqual({ ok: true, finding: empty });
  });

  it("refuses malformed versioned metadata instead of treating it as a legacy absence or raw fallback", () => {
    for (const value of [null, {}, { version: 2, missing: [], withheld: false }, { version: 1, missing: [], withheld: false }, { version: 1, role: "action", evidence: {}, missing: ["raw page words"], withheld: false }, { version: 1, role: "action", evidence: {}, missing: [], withheld: false, capture: "must not fall back" }, { version: 1, role: "unknown", evidence: {}, missing: [], withheld: false }]) {
      expect(automationStudioJudgeEvidenceFinding(value, [])).toEqual({ ok: false, code: "judge_evidence.finding_invalid" });
    }
  });
});
