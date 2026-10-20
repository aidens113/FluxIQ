// `automationStudioRecordRowIdentity` on its own. Cases moved from the
// downstream page-side dedupe's tests (`order-rows`, t728).
import { describe, expect, it } from "vitest";
import { automationStudioRecordRowIdentity } from "../index.ts";

describe("automationStudioRecordRowIdentity", () => {
  it("is one identity for values that differ only in layout and case", () => {
    const first = automationStudioRecordRowIdentity({ title: "Rust Engineer", company: "Acme" }, ["title", "company"]);
    expect(automationStudioRecordRowIdentity({ title: "Rust  engineer ", company: "ACME" }, ["title", "company"])).toBe(first);
    expect(automationStudioRecordRowIdentity({ title: "Rust Engineer", company: "Globex" }, ["title", "company"])).not.toBe(first);
  });

  it("is undefined for a row with none of the compared values, so it is never a duplicate", () => {
    expect(automationStudioRecordRowIdentity({ title: "A", url: null }, ["url"])).toBeUndefined();
    expect(automationStudioRecordRowIdentity({ title: "C" }, ["url"])).toBeUndefined();
    expect(automationStudioRecordRowIdentity({ url: "  " }, ["url"])).toBeUndefined();
    expect(automationStudioRecordRowIdentity({ url: "/x" }, ["url"])).toBe(automationStudioRecordRowIdentity({ title: "E", url: "/x" }, ["url"]));
  });

  it("identifies a row by the values it has when only some are present", () => {
    expect(automationStudioRecordRowIdentity({ title: "A" }, ["title", "url"])).toBe(automationStudioRecordRowIdentity({ title: "a", url: null }, ["title", "url"]));
    expect(automationStudioRecordRowIdentity({ title: "A" }, ["title", "url"])).not.toBe(automationStudioRecordRowIdentity({ title: "A", url: "/a" }, ["title", "url"]));
  });

  it("reads only a row's own values", () => {
    const inherited = Object.create({ url: "/a" }) as Record<string, unknown>;
    expect(automationStudioRecordRowIdentity(inherited, ["url"])).toBeUndefined();
  });
});
