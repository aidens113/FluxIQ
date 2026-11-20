import { describe, expect, it } from "vitest";
import { automationStudioRecordReadListKey } from "../list-key.ts";
import { automationStudioRecordReadPlace } from "../place.ts";

const PATH = ["result", "extracted"];
const KEY = "list.0a1b2c3d4e5f60718293a4b5c6d7";

describe("which list a read's answer says it read", () => {
  it("takes the key of the answer or of the object holding the rows, the nearer first", () => {
    expect(automationStudioRecordReadListKey({ result: { extracted: [], listKey: KEY } }, PATH)).toBe(KEY);
    expect(automationStudioRecordReadListKey({ listKey: "list.outer", result: { extracted: [], listKey: KEY } }, PATH)).toBe(KEY);
    expect(automationStudioRecordReadListKey({ listKey: KEY, result: { extracted: [] } }, PATH)).toBe(KEY);
  });

  it("says nothing when the answer names no list, and never reads one off the rows or the address", () => {
    expect(automationStudioRecordReadListKey({ result: { extracted: [{ listKey: KEY }], snapshot: { url: "https://seats.test/screen/3" } } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadListKey({ result: { extracted: [], listKey: "" } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadListKey({ result: { extracted: [], listKey: 7 } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadListKey({ result: { extracted: [], listKey: "x".repeat(201) } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadListKey(undefined, PATH)).toBeUndefined();
  });
});

describe("where in its list a read's answer says it read", () => {
  it("takes a numbered, next-link or load-more place as the pager said it", () => {
    for (const place of ["page=3", "offset=40", "cursor=Zm9v-bar_1"]) {
      expect(automationStudioRecordReadPlace({ result: { extracted: [], place } }, PATH)).toBe(place);
    }
    expect(automationStudioRecordReadPlace({ place: "page=1", result: { extracted: [], place: "page=2" } }, PATH)).toBe("page=2");
  });

  it("says nothing when the pager said none, and never makes one from the address or the rows", () => {
    expect(automationStudioRecordReadPlace({ result: { extracted: [{ place: "page=2" }], snapshot: { url: "https://seats.test/times?page=2" }, location: "https://seats.test/times?page=2" } }, PATH)).toBeUndefined();
    for (const place of ["", "page", "page=", "3", "Page=3", "page=two words", "page=3&", 3, null]) {
      expect(automationStudioRecordReadPlace({ result: { extracted: [], place } }, PATH), String(place)).toBeUndefined();
    }
    expect(automationStudioRecordReadPlace(undefined, PATH)).toBeUndefined();
  });
});
