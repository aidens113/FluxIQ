// Declared view keys grouped by where each view lives (t194 w48).
import { describe, expect, it } from "vitest";
import { automationStudioLlmEvidenceViewGroups } from "../view-groups.ts";

describe("the declared view keys, grouped", () => {
  it("puts the result's own keys first, then each holder in the order it was declared", () => {
    expect(automationStudioLlmEvidenceViewGroups(["read.extracted", "page", "elements", "read.rejectedRows", "list.rows"])).toEqual([
      { members: ["page", "elements"] },
      { holder: "read", members: ["extracted", "rejectedRows"] },
      { holder: "list", members: ["rows"] }
    ]);
  });

  it("ignores a key that is not a property name or one member of one", () => {
    expect(automationStudioLlmEvidenceViewGroups(["a.b.c", ".x", "y.", "page", "page"])).toEqual([{ members: ["page"] }]);
    expect(automationStudioLlmEvidenceViewGroups([])).toEqual([]);
  });
});
