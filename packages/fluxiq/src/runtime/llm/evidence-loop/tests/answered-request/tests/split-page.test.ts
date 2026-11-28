// An already-answered note on a whole-page capture delivered in parts names the parts not yet shown.
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceAnsweredRequestNote } from "../../../answered-request.ts";

const base = { code: "llm_evidence_loop.already_answered" as const, toolId: "core.full_page", answeredByCallId: "call.1", stepsWithoutProgress: 1 };

describe("the answered-request note on a split page", () => {
  it("names the parts not yet shown and how to ask for one", () => {
    const said = String(automationStudioLlmEvidenceAnsweredRequestNote({ ...base, splitPage: { parts: 4, shown: [1, 3] } }).instruction);
    expect(said).toContain("4 parts");
    expect(said).toContain("parts 2, 4 are not yet shown");
    expect(said).toContain("core.full_page with part N");
  });

  it("says nothing of parts when all were shown or the page was not split", () => {
    expect(String(automationStudioLlmEvidenceAnsweredRequestNote({ ...base, splitPage: { parts: 2, shown: [1, 2] } }).instruction)).not.toContain("parts");
    expect(String(automationStudioLlmEvidenceAnsweredRequestNote(base).instruction)).not.toContain("not yet shown");
  });
});
