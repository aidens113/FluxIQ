// A decision that edits many steps at once is read whole: a count past sixteen once made the
// loop read none of them, which wasted a paid call. The schema offered the model names no number.

import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceParseDecision } from "../../evidence-loop-decision.ts";

describe("an amend_draft decision's number of amendments", () => {
  const drops = (count: number) => Array.from({ length: count }, (_, index) => ({ step: index + 1, change: "drop" }));

  it("is read whole however many steps it edits", () => {
    for (const count of [16, 17, 40]) {
      const decision = automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: drops(count) });
      expect(decision).toMatchObject({ kind: "amend_draft" });
      expect((decision as unknown as { amendments: unknown[] }).amendments).toHaveLength(count);
    }
  });

  it("still needs at least one", () => {
    expect(automationStudioLlmEvidenceParseDecision({ kind: "amend_draft", amendments: [] })).toBeUndefined();
  });
});
