// A captured field the item does not show is a definite "not shown" in automatic processing (t993). A read of a
// lending library's shelf collects a "Renewable" tag only some loans carry; nothing here mirrors a Lab scenario.
import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import { automationStudioRecordCapturedFields, processAutomationStudioRecordRows, type AutomationStudioRecordCollectedRow, type AutomationStudioRecordProcessing } from "../index.ts";

const NOW = Date.UTC(2030, 0, 10, 12);
const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "title", label: "Title", valueType: "string" },
    { id: "tag", label: "Tag", valueType: "string" },
    { id: "fine", label: "Fine", valueType: "string" },
    { id: "due", label: "Due", valueType: "string" },
    { id: "limit", label: "Limit", valueType: "string" },
    { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
  ]
};
const CAPTURED = automationStudioRecordCapturedFields(SCHEMA);

function rows(values: readonly Record<string, unknown>[], batchKey = "read/one", captured: readonly string[] | null = CAPTURED): AutomationStudioRecordCollectedRow[] {
  return values.map((entry) => ({ values: entry, nodeId: "read", batchKey, ...(captured === null ? {} : { captured }) }));
}

function automatic(collected: AutomationStudioRecordCollectedRow[], process: AutomationStudioRecordProcessing) {
  return processAutomationStudioRecordRows({ mode: "automatic", rows: collected, schema: SCHEMA, process, now: NOW });
}

const SHELF = [
  { title: "Atlas", tag: "Renewable", fine: "$2", due: "2030-01-05" },
  { title: "Birds", fine: "$1", due: "2030-01-02" },
  { title: "Clocks", tag: "  ", due: "2030-01-08" },
  { title: "Dunes", tag: "Renewable online", fine: "$4" }
];

describe("a captured cell the item does not show", () => {
  it("lists the fields a batch captured: every stored field, never an excluded or encrypted one", () => {
    expect(CAPTURED).toEqual(["title", "tag", "fine", "due", "limit"]);
    expect(automationStudioRecordCapturedFields({ schemaVersion: "0.1", fields: [{ id: "a", label: "A", valueType: "string", handling: "include" }, { id: "b", label: "B", valueType: "string", handling: "encrypt" }] })).toEqual(["a"]);
  });

  it.each([
    ["contains", { field: "tag", contains: "Renewable" }, ["Atlas", "Dunes"]],
    ["equals", { field: "tag", equals: "Renewable" }, ["Atlas"]],
    ["present", { field: "tag", is: "present" as const }, ["Atlas", "Dunes"]],
    ["absent", { field: "tag", is: "absent" as const }, ["Birds", "Clocks"]],
    ["not contains", { field: "tag", contains: "online", not: true }, ["Atlas", "Birds", "Clocks"]],
    ["a number bound", { field: "fine", atMost: 3 }, ["Atlas", "Birds"]],
    ["a date bound", { field: "due", atLeast: "2030-01-03", as: "date" as const }, ["Atlas", "Clocks"]],
    ["a negated date bound", { field: "due", atLeast: "2030-01-03", as: "date" as const, not: true }, ["Birds"]]
  ])("gives %s a definite verdict and a ready answer", (_name, condition, kept) => {
    const result = automatic(rows(SHELF), { where: [condition], columns: ["title"] });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected a ready answer");
    expect(result.rows.map((row) => row.title)).toEqual(kept);
  });

  it("reads anyOf, a comparison and a derived column over the source the item does not show", () => {
    const anyOf = automatic(rows(SHELF), { anyOf: [[{ field: "tag", contains: "online" }, { field: "fine", atMost: 1 }]], columns: ["title"] });
    expect(anyOf.state === "ready" && anyOf.rows.map((row) => row.title)).toEqual(["Birds", "Dunes"]);
    const compared = automatic(rows([{ title: "Over", fine: "$5", limit: "$3" }, { title: "Unlimited", fine: "$5" }]), { compare: [{ field: "fine", greaterThan: "limit", not: true }], columns: ["title"] });
    // "Unlimited" shows no limit: the comparison fails whatever `not` says, as saved processing reads it.
    expect(compared.state === "empty" && compared.reason).toBe("no_matches");
    const derived = automatic(rows(SHELF), { derive: [{ id: "amount", from: "fine", as: "number" }], where: [{ field: "amount", atLeast: 2 }], columns: ["title"] });
    expect(derived.state === "ready" && derived.rows.map((row) => row.title)).toEqual(["Atlas", "Dunes"]);
  });

  it("sorts a value the item does not show last and answers it as an empty column", () => {
    const result = automatic(rows(SHELF), { sort: [{ field: "due", order: "desc", as: "date" }], columns: ["title", "tag", "due"] });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected a ready answer");
    expect(result.rows).toEqual([
      { title: "Clocks", tag: "  ", due: "2030-01-08" },
      { title: "Atlas", tag: "Renewable", due: "2030-01-05" },
      { title: "Birds", due: "2030-01-02" },
      { title: "Dunes", tag: "Renewable online" }
    ]);
  });

  it("keeps missing evidence for a field one batch never captured, naming that batch", () => {
    const before = rows([{ title: "Early", fine: "$1" }], "read/early", ["title", "fine", "due"]);
    const after = rows([{ title: "Late", tag: "Renewable" }, { title: "Later" }], "read/late");
    const result = automatic([...before, ...after], { where: [{ field: "tag", contains: "Renewable" }], columns: ["title"] });
    expect(result.state === "missing-evidence" && result.missingEvidence).toEqual([{ operator: "where", index: 0, field: "tag", reason: "missing", source: { nodeId: "read", batchKey: "read/early", row: 0 } }]);
    const sorted = automatic([...before, ...after], { sort: [{ field: "tag", order: "asc" }], columns: ["title"] });
    expect(sorted.state === "missing-evidence" && sorted.missingEvidence.map((entry) => [entry.operator, entry.source.batchKey])).toEqual([["sort", "read/early"]]);
    const shown = automatic([...before, ...after], { columns: ["title", "tag"] });
    expect(shown.state === "missing-evidence" && shown.missingEvidence.map((entry) => [entry.operator, entry.source.batchKey])).toEqual([["columns", "read/early"]]);
  });

  it("keeps missing evidence for every absent cell of a row whose captured fields are unknown", () => {
    const result = automatic(rows([{ title: "Unknown" }], "read/old", null), { where: [{ field: "tag", contains: "Renewable" }], columns: ["title"] });
    expect(result.state === "missing-evidence" && result.missingEvidence[0]).toMatchObject({ field: "tag", reason: "missing", source: { batchKey: "read/old" } });
  });

  it("keeps an unreadable present value unreadable", () => {
    const result = automatic(rows([{ title: "Odd", fine: "waived" }]), { where: [{ field: "fine", atMost: 3 }], columns: ["title"] });
    expect(result.state === "missing-evidence" && result.missingEvidence[0]).toMatchObject({ field: "fine", reason: "unreadable" });
    const withheld = automatic(rows([{ title: "Hidden", tag: "[withheld]" }]), { where: [{ field: "tag", contains: "Renewable" }], columns: ["title"] });
    expect(withheld.state === "missing-evidence" && withheld.missingEvidence[0]).toMatchObject({ field: "tag", reason: "unreadable" });
  });

  it("leaves saved processing unchanged by what a read captured", () => {
    const process: AutomationStudioRecordProcessing = { where: [{ field: "tag", contains: "Renewable", not: true }], sort: [{ field: "fine", order: "asc", as: "number" }], columns: ["title", "fine"] };
    const withCaptured = processAutomationStudioRecordRows({ rows: rows(SHELF), schema: SCHEMA, process, now: NOW });
    const without = processAutomationStudioRecordRows({ rows: rows(SHELF, "read/one", null), schema: SCHEMA, process, now: NOW });
    expect(withCaptured).toEqual(without);
    expect(withCaptured.rows).toEqual([{ title: "Birds", fine: "$1" }, { title: "Clocks" }]);
  });
});
