import { describe, expect, it } from "vitest";
import { processAutomationStudioRecordRows } from "../process-rows.ts";
import type { AutomationStudioRecordCondition } from "../types.ts";

const NOW = Date.UTC(2026, 9, 25);
function evaluated(values: Record<string, unknown>[], condition: AutomationStudioRecordCondition) {
  return processAutomationStudioRecordRows({
    rows: values.map((row) => ({ values: row, nodeId: "catalogue.read", batchKey: "batch.1" })),
    schema: { schemaVersion: "0.1", fields: ["title", "shelf"].map((id) => ({ id, label: id, valueType: "string" })) },
    process: { where: [condition] }, now: NOW
  });
}

describe("processing owns the tested-cell evidence of its actual exclusions", () => {
  it("distinguishes measured absence from unavailable or withheld values", () => {
    const { account } = evaluated([
      { title: "Missing" }, { title: "Null", shelf: null }, { title: "Blank", shelf: " \n " },
      { title: "Opaque", shelf: { note: "not a primitive cell" } }, { title: "Withheld", shelf: "[withheld]" }
    ], { field: "shelf", matches: "^Available$" });
    expect(account.conditions![0]!.leftOutOnlyByThis.map((row) => row.tested)).toEqual([
      { state: "absent" }, { state: "absent" }, { state: "absent" }, { state: "unavailable" }, { state: "unavailable" }
    ]);
  });

  it("keeps conflicting duplicate-label captures unavailable, even when all were rejected", () => {
    const { account } = evaluated([
      { title: "Shared title", shelf: "On loan" }, { title: "Shared title", shelf: "In transit" }, { title: "Shared title", shelf: "On loan" },
      { title: "Same reading", shelf: "On loan" }, { title: "Same reading", shelf: "On loan" }
    ], { field: "shelf", equals: "Available" });
    expect(account.conditions![0]!.leftOutOnlyByThis).toEqual([
      { field: "title", label: "Shared title", tested: { state: "unavailable" } },
      { field: "title", label: "Same reading", tested: { state: "present", value: "On loan" } }
    ]);
    expect(account.conditions![0]!.alone).toBe(5);
  });

  it("also detects a conflicting same-label kept capture and a different label column", () => {
    const one = evaluated([{ title: "Shared", shelf: "On loan" }, { title: "Shared", shelf: "Available" }], { field: "shelf", equals: "Available" });
    expect(one.account.conditions![0]!.leftOutOnlyByThis[0]!.tested).toEqual({ state: "unavailable" });
    const two = evaluated([{ title: "Shared", shelf: "On loan" }, { shelf: "Shared" }], { field: "shelf", equals: "Available" });
    expect(two.account.conditions![0]!.leftOutOnlyByThis[0]!.tested).toEqual({ state: "unavailable" });
  });

  it("does not turn an original numeric value into a different textual reading", () => {
    const result = evaluated([{ title: "Large number", shelf: 1e21 }], { field: "shelf", atMost: 10 });
    expect(result.rows).toEqual([]);
    expect(result.account.conditions![0]!.leftOutOnlyByThis[0]!.tested).toEqual({ state: "unavailable" });
    const ordinary = evaluated([{ title: "Zero", shelf: 0 }, { title: "False", shelf: false }], { field: "shelf", is: "absent" });
    expect(ordinary.account.conditions![0]!.leftOutOnlyByThis.map((row) => row.tested)).toEqual([{ state: "present", value: "0" }, { state: "present", value: "false" }]);
  });

  it("copies the evaluated condition, clock and values without changing producer inputs", () => {
    const values = [{ title: "A Field Guide to Clouds", shelf: "On loan" }];
    const condition: AutomationStudioRecordCondition = { field: "shelf", equals: ["Available", "Reading room"] };
    const before = structuredClone({ values, condition });
    const result = evaluated(values, condition);
    expect({ values, condition }).toEqual(before);
    expect(result.account.conditions![0]!.evaluation).toEqual({ condition, now: NOW });
    const copied = result.account.conditions![0]!.evaluation!.condition.equals;
    if (Array.isArray(copied)) copied.push("Changed only on evidence");
    const tested = result.account.conditions![0]!.leftOutOnlyByThis[0]!.tested;
    if (tested?.state === "present") tested.value = "Changed only on evidence";
    expect({ values, condition }).toEqual(before);
    // The actual persistence seam JSON-serializes the whole account; no
    // special runtime object or prototype is required to preserve its proof.
    expect(JSON.parse(JSON.stringify(result.account))).toEqual(result.account);
  });

  it("preserves the processing clock for relative dates and explicit regex case semantics", () => {
    const dated = evaluated([{ title: "Earlier", shelf: "yesterday" }, { title: "Current", shelf: "today" }], { field: "shelf", atLeast: "today" });
    expect(dated.rows).toHaveLength(1);
    expect(dated.account.conditions![0]!.evaluation!.now).toBe(NOW);
    expect(dated.account.conditions![0]!.leftOutOnlyByThis[0]!.tested).toEqual({ state: "present", value: "yesterday" });
    const text = evaluated([{ title: "Exact", shelf: "Available" }, { title: "Lower", shelf: "available" }], { field: "shelf", matches: "/^Available$/" });
    expect(text.account.conditions![0]!.leftOutOnlyByThis.map((row) => row.label)).toEqual(["Lower"]);
  });
});
