import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceCallDiagnostic } from "../index.ts";
import { automationStudioLlmEvidenceDiagnostic } from "../../evidence-diagnostic/index.ts";
import { automationStudioLlmEvidenceParseToolExecutionResult } from "../../evidence-loop-decision.ts";

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
      const parsed = automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { ok: false }, effectApplied: false, diagnostic: value } as never, "mutate");
      expect(parsed).toMatchObject({ evidence: { ok: false }, effectApplied: false });
      expect(parsed?.diagnostic).toBeUndefined();
    }
  });
  it("keeps compatibility with callers that carry no diagnostic", () => {
    expect(automationStudioLlmEvidenceParseToolExecutionResult({ kind: "llm_evidence_tool_execution", evidence: { ok: true }, effectApplied: true }, "mutate")).toEqual({ evidence: { ok: true }, effectApplied: true });
  });
});
