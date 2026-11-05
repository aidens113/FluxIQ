import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA } from "../schema.ts";
import { automationStudioLlmWellFormedVerificationChecked } from "../well-formed.ts";

describe("automationStudioLlmWellFormedVerificationChecked", () => {
  it("keeps a closed row, column and value, rebuilt key by key", () => {
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked([{ row: "Oak Desk", column: "price", value: "120" }]);
    expect(kept).toEqual([{ row: "Oak Desk", column: "price", value: "120" }]);
    expect(dropped).toEqual([]);
  });

  it("drops an entry with an extra key, a missing or blank key, or a non-string, naming its place", () => {
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked([
      { row: "A", column: "c", value: "v", extra: "x" },
      { row: "A", column: "c" },
      { row: "  ", column: "c", value: "v" },
      { row: "A", column: "c", value: 3 },
      "A",
      { row: "B", column: "c", value: "v" }
    ]);
    expect(kept).toEqual([{ row: "B", column: "c", value: "v" }]);
    expect(dropped).toEqual([0, 1, 2, 3, 4]);
  });

  it("keeps every cell however many are cited, and a cell however long its text", () => {
    const many = Array.from({ length: 40 }, (_, at) => ({ row: `r${at}`, column: "c", value: at === 0 ? "x".repeat(5000) : "v" }));
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked(many);
    expect(kept).toHaveLength(40);
    expect(kept[0]?.value).toHaveLength(5000);
    expect(dropped).toEqual([]);
  });

  it("offers the model neither a number of cells nor a length", () => {
    expect(JSON.stringify(AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA)).not.toMatch(/maxItems|maxLength/u);
  });

  it("says a value that is no list is dropped whole", () => {
    expect(automationStudioLlmWellFormedVerificationChecked("x")).toEqual({ kept: [], dropped: [undefined] });
  });
});
