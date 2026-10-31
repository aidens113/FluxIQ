import { describe, expect, it } from "vitest";
import { readAutomationStudioResolvedActionEffect } from "../index.ts";

describe("a resolved action-effect contract", () => {
  it("reads a known class and canonicalises its known consequence floor", () => {
    expect(readAutomationStudioResolvedActionEffect({ effectClass: "state", permissionConsequences: [] })).toEqual({ effectClass: "state", permissionConsequences: [] });
    expect(readAutomationStudioResolvedActionEffect({ effectClass: "observe", permissionConsequences: ["create_new", "move_money", "create_new"] })).toEqual({ effectClass: "commit", permissionConsequences: ["move_money", "create_new"] });
  });

  it("rejects an unknown consequence even beside a known floor", () => {
    for (const permissionConsequences of [["delete", "purchase"], ["delete", null], "delete", undefined, Array(1), Array(11).fill("delete")]) {
      expect(() => readAutomationStudioResolvedActionEffect({ effectClass: "commit", permissionConsequences })).toThrow();
    }
  });

  it("accepts no predicate, unknown field, misspelled class or malformed object", () => {
    for (const value of [
      undefined,
      null,
      [],
      { effectClass: "mutate", permissionConsequences: [] },
      { effectClass: "commit", permissionConsequences: [], commitWhen: "apply" },
      { effectClass: "commit", permissionConsequences: [], idempotent: true }
    ]) {
      expect(() => readAutomationStudioResolvedActionEffect(value)).toThrow();
    }
  });
});
