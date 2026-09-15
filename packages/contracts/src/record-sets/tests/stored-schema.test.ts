import { describe, expect, it } from "vitest";
import { storedAutomationStudioRecordSchema, type AutomationStudioRecordSchema } from "../index.ts";

function deepFreeze<T>(value: T): T {
  if (typeof value === "object" && value !== null) {
    for (const item of Object.values(value)) deepFreeze(item);
    Object.freeze(value);
  }
  return value;
}

describe("storedAutomationStudioRecordSchema", () => {
  it("removes exclude fields, keeps order and every other field, and leaves the input unmodified", () => {
    const input: AutomationStudioRecordSchema = deepFreeze({
      schemaVersion: "0.1",
      fields: [
        { id: "title", label: "Title", valueType: "string", required: true },
        { id: "session", label: "Session", valueType: "string", handling: "exclude" },
        { id: "price", label: "Price", valueType: "number", handling: "include" },
        { id: "card", label: "Card", valueType: "string", handling: "encrypt" },
        { id: "cookie", label: "Cookie", valueType: "json", handling: "exclude", required: true }
      ],
      primaryKey: ["title"]
    });
    const before = JSON.stringify(input);

    const stored = storedAutomationStudioRecordSchema(input);

    expect(stored).toEqual({
      schemaVersion: "0.1",
      fields: [
        { id: "title", label: "Title", valueType: "string", required: true },
        { id: "price", label: "Price", valueType: "number", handling: "include" },
        { id: "card", label: "Card", valueType: "string", handling: "encrypt" }
      ],
      primaryKey: ["title"]
    });
    expect(JSON.stringify(stored)).not.toContain("session");
    expect(JSON.stringify(stored)).not.toContain("cookie");
    expect(JSON.stringify(input)).toBe(before);
    expect(stored.fields[0]).not.toBe(input.fields[0]);
    expect(stored.primaryKey).not.toBe(input.primaryKey);
  });

  it("omits primaryKey when the input has none", () => {
    const stored = storedAutomationStudioRecordSchema({ schemaVersion: "0.1", fields: [{ id: "a", label: "A", valueType: "string" }] });
    expect(Object.hasOwn(stored, "primaryKey")).toBe(false);
  });
});
