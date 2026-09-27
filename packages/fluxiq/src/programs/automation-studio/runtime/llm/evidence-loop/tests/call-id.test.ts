// A call id the model reused is resolved rather than fatal.
//
// The loop used to end as `llm_evidence_loop.duplicate_call` when the model
// wrote an id it had already used. The ids are the model's own bookkeeping and
// the evidence only needs them to be distinct, so a clash costs a suffix. The
// loop covers the ordinary clash end to end (`../../tests/evidence-loop.test.ts`);
// these hold the bound a request the provider schema still accepts cannot reach
// from there.

import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceUnusedCallId } from "../call-id.ts";

describe("the id an evidence entry is filed under", () => {
  it("is the one asked for when nothing has taken it", () => {
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1"]), "call.2")).toBe("call.2");
  });

  it("takes the first free suffix, counting from two", () => {
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1"]), "call.1")).toBe("call.1.2");
    expect(automationStudioLlmEvidenceUnusedCallId(new Set(["call.1", "call.1.2", "call.1.3"]), "call.1")).toBe("call.1.4");
  });

  it("stays within the 200-character bound the provider schema holds an id to", () => {
    const long = "c".repeat(200);
    const suffixed = automationStudioLlmEvidenceUnusedCallId(new Set([long]), long);

    expect(suffixed).toHaveLength(200);
    expect(suffixed.endsWith(".2")).toBe(true);
  });
});
