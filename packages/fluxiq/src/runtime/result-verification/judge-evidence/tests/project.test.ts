import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import type { AutomationStudioJudgeEvidenceProjector } from "../../../llm/harness-options/index.ts";
import { automationStudioProjectJudgeEvidence } from "../index.ts";

const id = "4c29ef4a-7777-4333-8222-64782b979db3";

describe("domain-owned semantic judge evidence", () => {
  it("retains every original row cell, UUID, date, number and array without trail-bookkeeping stripping", () => {
    const rows = Array.from({ length: 1_201 }, (_, index) => ({ id: `${id}/${index}`, originalId: id, publishedAt: 1_795_312_345_000, elapsedMs: 4, date: "2 days ago", price: "$12.50", amount: 12.5, flags: [true, false, null], labels: ["first", "second"] }));
    const original: JsonObject = { rows, capture: "private full target capture".repeat(1000) };
    const before = structuredClone(original);
    const projector: AutomationStudioJudgeEvidenceProjector = ({ evidence }) => ({ role: "data", evidence: { rows: (evidence as JsonObject).rows! } });
    const projected = automationStudioProjectJudgeEvidence({ source: "call", evidence: original }, projector, []);
    expect(projected).toEqual({ role: "data", evidence: { rows }, missing: [], withheld: false });
    expect(projected.evidence).not.toBe(original);
    expect(JSON.stringify(projected)).not.toContain("private full target capture");
    expect(original).toEqual(before);
  });

  it("gives a projector a distinct deeply frozen input and refuses attempted mutation", () => {
    const original: JsonObject = { rows: [{ id, title: "Original title" }], capture: { body: "original capture" } };
    const before = structuredClone(original);
    let frozen = false;
    const projector: AutomationStudioJudgeEvidenceProjector = (input) => {
      const rows = (input.evidence as JsonObject).rows as JsonObject[];
      frozen = input.evidence !== original && Object.isFrozen(input) && Object.isFrozen(input.evidence) && Object.isFrozen(rows) && Object.isFrozen(rows[0]);
      rows[0]!.title = "changed by projector";
      return { role: "data", evidence: rows };
    };
    const projected = automationStudioProjectJudgeEvidence({ source: "build-observation", evidence: original }, projector, []);
    expect(frozen).toBe(true);
    expect(projected).toEqual({ missing: ["judge_evidence.projection_failed"], withheld: true });
    expect(original).toEqual(before);
  });

  it("represents old/non-web bindings without a projector as missing rather than forwarding unknown domain evidence", () => {
    const original = { unknownDomainPayload: "whole private target capture" };
    expect(automationStudioProjectJudgeEvidence({ source: "legacy", evidence: original }, undefined, [])).toEqual({ missing: ["judge_evidence.projector_missing"], withheld: true });
    expect(original).toEqual({ unknownDomainPayload: "whole private target capture" });
  });

  it("requires a denied-key declaration before carrying host evidence", () => {
    const projector: AutomationStudioJudgeEvidenceProjector = () => ({ role: "action", evidence: { changed: "Actual change" } });
    expect(automationStudioProjectJudgeEvidence({ source: "flow-attempt", evidence: {} }, projector, undefined)).toEqual({ missing: ["judge_evidence.denied_keys_missing"], withheld: true });
  });

  it("keeps safe sibling facts while screening excluded and credential-shaped cells", () => {
    const credentialShape = "sk-" + "a".repeat(48);
    const projector: AutomationStudioJudgeEvidenceProjector = () => ({ role: "action", evidence: { amount: 3, originalId: id, privateField: "excluded", secret: credentialShape, values: [1, 2, 3] } });
    const projected = automationStudioProjectJudgeEvidence({ source: "call", evidence: {} }, projector, ["privateField"]);
    expect(projected.evidence).toEqual({ amount: 3, originalId: id, withheld: "(withheld)", secret: "(withheld)", values: [1, 2, 3] });
    expect(projected.missing).toEqual([]);
    expect(projected.withheld).toBe(true);
    expect(JSON.stringify(projected)).not.toContain(credentialShape);
    expect(JSON.stringify(projected)).not.toContain("excluded");
  });

  it("preserves complete empty data and partial findings with explicit missing evidence", () => {
    const empty: AutomationStudioJudgeEvidenceProjector = () => ({ role: "data", evidence: { rows: [] } });
    expect(automationStudioProjectJudgeEvidence({ source: "call", evidence: {} }, empty, [])).toEqual({ role: "data", evidence: { rows: [] }, missing: [], withheld: false });
    const partial: AutomationStudioJudgeEvidenceProjector = () => ({ role: "action", evidence: { notice: "Action response was received" }, missing: ["effect.not_proven"] });
    expect(automationStudioProjectJudgeEvidence({ source: "state", phase: "after", evidence: {} }, partial, [])).toEqual({ role: "action", evidence: { notice: "Action response was received" }, missing: ["effect.not_proven"], withheld: true });
  });

  it("refuses malformed projector results without a raw fallback", () => {
    const cyclic: JsonObject = {};
    cyclic.self = cyclic;
    const invalid: unknown[] = [
      null, { role: "invented", evidence: {} }, { role: "data", evidence: {}, extra: "not a declared member" },
      { role: "data", evidence: { value: Number.NaN } }, { role: "data", evidence: { value: undefined } },
      { role: "data", evidence: new Date(0) }, { role: "data", evidence: cyclic }, { role: "action", missing: [""] },
      { role: "action", missing: ["<private capture>"] }, { role: "action", missing: ["sk-" + "a".repeat(48)] }
    ];
    for (const response of invalid) {
      const projector: AutomationStudioJudgeEvidenceProjector = () => response as ReturnType<AutomationStudioJudgeEvidenceProjector>;
      const projected = automationStudioProjectJudgeEvidence({ source: "legacy", evidence: { raw: "private capture" } }, projector, []);
      expect(projected).toEqual({ missing: ["judge_evidence.projection_invalid"], withheld: true });
      expect(JSON.stringify(projected)).not.toContain("private capture");
    }
  });

  it("states when no semantic finding was supplied, including thrown projection", () => {
    const absent: AutomationStudioJudgeEvidenceProjector = () => ({ role: "observation" });
    expect(automationStudioProjectJudgeEvidence({ source: "state", evidence: {} }, absent, [])).toEqual({ role: "observation", missing: ["judge_evidence.finding_missing"], withheld: true });
    const failed: AutomationStudioJudgeEvidenceProjector = () => { throw new Error("private error body"); };
    expect(automationStudioProjectJudgeEvidence({ source: "state", evidence: {} }, failed, [])).toEqual({ missing: ["judge_evidence.projection_failed"], withheld: true });
  });
});
