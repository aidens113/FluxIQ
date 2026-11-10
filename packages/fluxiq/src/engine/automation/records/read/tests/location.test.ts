import { describe, expect, it } from "vitest";
import { automationStudioRecordReadLocation } from "../location.ts";

const PATH = ["result", "extracted"];

describe("the address a read's answer says it read", () => {
  it("takes the snapshot's url beside the rows", () => {
    expect(automationStudioRecordReadLocation({ result: { extracted: [], snapshot: { url: "http://127.0.0.1:5000/a?page=2", title: "A" } } }, PATH)).toBe("http://127.0.0.1:5000/a?page=2");
  });

  it("takes a `location` of the answer or of the object holding the rows, the nearer first", () => {
    expect(automationStudioRecordReadLocation({ location: "http://127.0.0.1:5000/outer", result: { extracted: [], location: "http://127.0.0.1:5000/inner" } }, PATH)).toBe("http://127.0.0.1:5000/inner");
    expect(automationStudioRecordReadLocation({ location: "http://127.0.0.1:5000/outer", result: { extracted: [] } }, PATH)).toBe("http://127.0.0.1:5000/outer");
  });

  it("says nothing when no whole address is there", () => {
    expect(automationStudioRecordReadLocation({ result: { extracted: [], snapshot: { title: "A" } } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadLocation({ result: { extracted: [], location: "not an address" } }, PATH)).toBeUndefined();
    expect(automationStudioRecordReadLocation(undefined, PATH)).toBeUndefined();
    expect(automationStudioRecordReadLocation({ items: [] }, ["items"])).toBeUndefined();
  });
});
