import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../core/index.ts";
import { automationStudioLlmEvidenceCallDiagnostic } from "../index.ts";
import { automationStudioLlmEvidenceDiagnostic } from "../../evidence-diagnostic/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult, automationStudioLlmEvidenceToolResultInvalidCode } from "../../evidence-loop-decision.ts";

const diagnostic = { schemaVersion: "demo-refusal.v1", reference: "item.4", blockingReferences: ["item.8"], count: 1, observed: true };

describe("opaque caller diagnostics", () => {
  it("copies structural values without interpreting the caller's vocabulary", () => {
    const clean = automationStudioLlmEvidenceDiagnostic(diagnostic);
    expect(clean).toEqual(diagnostic);
    expect(clean).not.toBe(diagnostic);
    expect(clean?.blockingReferences).not.toBe(diagnostic.blockingReferences);
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, diagnostic }, "mutate");
    expect(parsed?.diagnostic).toEqual(diagnostic);
    expect(automationStudioLlmEvidenceCallDiagnostic(parsed!)).toEqual({ diagnostic });
  });
  it("drops malformed diagnostic data without refusing the actual tool result", () => {
    for (const value of [{ label: "Private page words" }, { url: "https://private.test" }, { nested: { arbitrary: "data" } }, { count: -1 }, { values: [Infinity] }]) {
      expect(automationStudioLlmEvidenceDiagnostic(value)).toBeUndefined();
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, diagnostic: value }, "mutate");
      expect(parsed).toMatchObject({ evidence: { ok: false }, effectApplied: false });
      expect(parsed?.diagnostic).toBeUndefined();
    }
  });
  it("keeps compatibility with callers that carry no diagnostic", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true }, "mutate")).toEqual({ evidence: { ok: true }, effectApplied: true });
  });
});

const schema: JsonObject = {
  schemaVersion: "0.1", primaryKey: ["id"],
  fields: [{ id: "id", label: "Id", valueType: "string", semanticType: "id" }, { id: "mark", label: "Mark", valueType: "boolean", semanticType: "flag", mark: "badge" }]
};

describe("host record-schema execution metadata", () => {
  it("keeps old callers compatible and carries validated metadata separately from evidence", () => {
    const old = { kind: "llm_evidence_tool_execution", evidence: { rows: [] }, effectApplied: false };
    expect(automationStudioLlmEvidenceParseToolExecutionResult(old, "observe")).toEqual({ evidence: old.evidence, effectApplied: false });
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ ...old, recordSchema: schema }, "observe");
    expect(parsed?.recordSchema).toEqual(schema);
    expect(parsed?.recordSchema).not.toBe(schema);
    expect(parsed?.evidence).toEqual(old.evidence);
  });

  it.each([null, { ...schema, fields: "wrong" }, { ...schema, fields: [{ id: "x", label: "X", valueType: "string", semanticType: "invented" }] }, { ...schema, fields: [{ id: "x", label: "X", valueType: "string", mark: "invented" }] }])("rejects metadata without erasing an applied effect", (recordSchema) => {
    const original = { kind: "llm_evidence_tool_execution", evidence: { action: "applied" }, effectApplied: true, resultCode: "action.applied", recordSchema };
    expect(automationStudioLlmEvidenceToolResultInvalidCode(original, "mutate")).toBeUndefined();
    expect(automationStudioLlmEvidenceParseToolExecutionResult(original, "mutate")).toEqual({ evidence: original.evidence, effectApplied: true, resultCode: "action.applied", recordSchema: null });
  });

  it("preserves an existing control failure when schema metadata is rejected", () => {
    const failure = { category: "output_not_observed", code: "failed", retryable: true, stage: "dispatch" };
    const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { action: "uncertain" }, effectApplied: true, failure, recordSchema: null }, "mutate");
    expect(parsed).toMatchObject({ effectApplied: true, failure, recordSchema: null });
  });
});
