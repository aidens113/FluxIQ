import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA } from "../schema.ts";
import { automationStudioLlmWellFormedVerificationChecked } from "../well-formed.ts";

describe("automationStudioLlmWellFormedVerificationChecked", () => {
  it("keeps a closed row, column and value, rebuilt key by key", () => {
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked([{ row: "Oak Desk", column: "price", value: "120" }]);
    expect(kept).toEqual([{ row: "Oak Desk", column: "price", value: "120" }]);
    expect(dropped).toEqual([]);
  });

  it("drops an entry with an extra key, a missing or blank key, a non-string or an over-long text, naming its place", () => {
    const long = "x".repeat(501);
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked([
      { row: "A", column: "c", value: "v", extra: "x" },
      { row: "A", column: "c" },
      { row: "  ", column: "c", value: "v" },
      { row: "A", column: "c", value: 3 },
      { row: long, column: "c", value: "v" },
      "A",
      { row: "B", column: "c", value: "v" }
    ]);
    expect(kept).toEqual([{ row: "B", column: "c", value: "v" }]);
    expect(dropped).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps at most the schema's twelve and drops the rest", () => {
    const many = Array.from({ length: 14 }, (_, at) => ({ row: `r${at}`, column: "c", value: "v" }));
    const { kept, dropped } = automationStudioLlmWellFormedVerificationChecked(many);
    expect(kept).toHaveLength(AUTOMATION_STUDIO_LLM_VERIFICATION_CHECKED_SCHEMA.maxItems);
    expect(dropped).toEqual([12, 13]);
  });

  it("says a value that is no list is dropped whole", () => {
    expect(automationStudioLlmWellFormedVerificationChecked("x")).toEqual({ kept: [], dropped: [undefined] });
  });
});
