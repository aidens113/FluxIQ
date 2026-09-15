import { describe, expect, it } from "vitest";
import { AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS, parseAutomationStudioRecordsPath } from "../index.ts";

describe("parseAutomationStudioRecordsPath", () => {
  it("splits a valid dot-separated path", () => {
    expect(parseAutomationStudioRecordsPath("extracted")).toEqual(["extracted"]);
    expect(parseAutomationStudioRecordsPath("data.items")).toEqual(["data", "items"]);
    expect(parseAutomationStudioRecordsPath("pages.0.rows_v-2")).toEqual(["pages", "0", "rows_v-2"]);
  });

  it("rejects empty segments, other syntax, and prototype segments", () => {
    for (const path of ["", ".", "a.", ".a", "a..b", "a b", "items[0]", "$.items", "a/b", "__proto__", "a.constructor", "prototype.x"]) {
      expect(parseAutomationStudioRecordsPath(path)).toBeNull();
    }
    expect(parseAutomationStudioRecordsPath(undefined)).toBeNull();
    expect(parseAutomationStudioRecordsPath(["a"])).toBeNull();
  });

  it("enforces the segment count and length caps", () => {
    const { recordsPathMaxSegments, recordsPathMaxLength } = AUTOMATION_STUDIO_RECORD_OUTPUT_LIMITS;
    expect(parseAutomationStudioRecordsPath(Array.from({ length: recordsPathMaxSegments }, () => "a").join("."))).toHaveLength(recordsPathMaxSegments);
    expect(parseAutomationStudioRecordsPath(Array.from({ length: recordsPathMaxSegments + 1 }, () => "a").join("."))).toBeNull();
    const longest = `${"a".repeat(100)}.${"b".repeat(recordsPathMaxLength - 101)}`;
    expect(longest).toHaveLength(recordsPathMaxLength);
    expect(parseAutomationStudioRecordsPath(longest)).not.toBeNull();
    expect(parseAutomationStudioRecordsPath(`${longest}c`)).toBeNull();
  });
});
