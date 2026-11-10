// A per-call run takes the union of its Flow's lasting classes and permitted consequences.
import { describe, expect, it } from "vitest";
import { assistantRunConsequences } from "../index.ts";

describe("assistantRunConsequences", () => {
  it("is change alone for a Flow with no lasting acts", () => {
    expect(assistantRunConsequences({ lastingClasses: [], permittedConsequences: [] })).toEqual(["change"]);
  });

  it("maps send_or_publish, move_money and delete, and folds the rest into change", () => {
    expect(assistantRunConsequences({ lastingClasses: ["send_or_publish"], permittedConsequences: [] })).toEqual(["change", "send"]);
    expect(assistantRunConsequences({ lastingClasses: ["move_money"], permittedConsequences: [] })).toEqual(["change", "money"]);
    expect(assistantRunConsequences({ lastingClasses: ["delete"], permittedConsequences: [] })).toEqual(["change", "delete"]);
    expect(assistantRunConsequences({ lastingClasses: ["create_new", "modify_existing"], permittedConsequences: [] })).toEqual(["change"]);
  });

  it("unions the declared classes with the permitted ones, without repeats, in class order", () => {
    expect(assistantRunConsequences({ lastingClasses: ["delete", "create_new"], permittedConsequences: ["move_money", "delete", "send_or_publish"] }))
      .toEqual(["change", "send", "money", "delete"]);
  });

  it("refuses a lasting class it does not know", () => {
    const unknown = JSON.parse("[\"teleport\"]") as Parameters<typeof assistantRunConsequences>[0]["lastingClasses"];
    expect(() => assistantRunConsequences({ lastingClasses: unknown, permittedConsequences: [] })).toThrow(/Unknown lasting class/u);
  });
});
