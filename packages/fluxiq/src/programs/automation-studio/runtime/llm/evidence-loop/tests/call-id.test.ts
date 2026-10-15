// A call id the model reused is resolved rather than fatal.
//
// The loop used to end as `llm_evidence_loop.duplicate_call` when the model
// wrote an id it had already used. The ids are the model's own bookkeeping and
// the evidence only needs them to be distinct, so a clash costs a suffix. The
// loop covers the ordinary clash end to end (`../../tests/evidence-loop.test.ts`);
// these hold the bound a request the provider schema still accepts cannot reach
// from there.

import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceIsOpeningCallId, automationStudioLlmEvidenceOpeningCallId, automationStudioLlmEvidenceUnusedCallId } from "../call-id.ts";

describe("the id an evidence entry is filed under", () => {
  it("is the one asked for when nothing has taken it", () => {
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1"]), "call.2")).toBe("call.2");
  });

  it("takes the first free suffix, counting from two", () => {
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1"]), "call.1")).toBe("call.1.2");
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1", "call.1.2", "call.1.3"]), "call.1")).toBe("call.1.4");
  });

  it("never files a model's id as an opening call's, scoped or not (t648)", () => {
    for (const requested of ["initial.core.run_node", "initial.core.run_node.brief-1", "initial.x"]) {
      const filed = automationStudioLlmEvidenceUnusedCallId(new Set(), requested);
      expect(filed).toBe(`model.${requested}`);
      expect(automationStudioLlmEvidenceIsOpeningCallId(filed)).toBe(false);
    }
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["model.initial.x"]), "initial.x")).toBe("model.initial.x.2");
    expect(automationStudioLlmEvidenceIsOpeningCallId(automationStudioLlmEvidenceUnusedCallId(new Set(), `initial.${"c".repeat(198)}`))).toBe(false);
  });

  it("stays within the 200-character bound the provider schema holds an id to", () => {
    const long = "c".repeat(200);
    const suffixed = automationStudioLlmEvidenceUnusedCallId(new Set([long]), long);

    expect(suffixed).toHaveLength(200);
    expect(suffixed.endsWith(".2")).toBe(true);
  });
});

describe("the opening call's id (t537)", () => {
  it("is byte-identical to what it always was without a scope", () => {
    expect(automationStudioLlmEvidenceOpeningCallId("core.run_node")).toBe("initial.core.run_node");
  });

  it("carries a scope as a suffix, still an id the provider schema accepts", () => {
    const scoped = automationStudioLlmEvidenceOpeningCallId("core.run_node", "brief-1");
    expect(scoped).toBe("initial.core.run_node.brief-1");
    expect(scoped).toMatch(/^[a-zA-Z0-9_.:-]{1,200}$/u);
  });

  it("refuses a scope that would break the id or its reading", () => {
    for (const scope of ["", "a.b", "has space", "x".repeat(41)]) expect(() => automationStudioLlmEvidenceOpeningCallId("core.run_node", scope), scope).toThrow("llm_evidence_loop.call_scope_invalid");
  });

  it("is recognised scoped or not, and no other id is", () => {
    expect(automationStudioLlmEvidenceIsOpeningCallId(automationStudioLlmEvidenceOpeningCallId("core.run_node"))).toBe(true);
    expect(automationStudioLlmEvidenceIsOpeningCallId(automationStudioLlmEvidenceOpeningCallId("core.run_node", "brief-1"))).toBe(true);
    expect(automationStudioLlmEvidenceIsOpeningCallId("submit.1")).toBe(false);
    expect(automationStudioLlmEvidenceIsOpeningCallId("dryrun.1.reset")).toBe(false);
  });
});
