import { describe, expect, it } from "vitest";
import type { AutomationStudioRecordSchema } from "../../schema.ts";
import { parseAutomationStudioRecordCondition, processAutomationStudioRecordRows, type AutomationStudioRecordProcessing } from "../index.ts";

const NOW = Date.UTC(2026, 10, 20, 12);
const SCHEMA: AutomationStudioRecordSchema = {
  schemaVersion: "0.1",
  fields: [
    { id: "id", label: "Identity", valueType: "string" },
    { id: "region", label: "Region", valueType: "string" },
    { id: "title", label: "Title", valueType: "string" },
    { id: "price", label: "Price", valueType: "string" },
    { id: "previous", label: "Previous price", valueType: "string" },
    { id: "count", label: "Count", valueType: "string" },
    { id: "date", label: "Date", valueType: "string" },
    { id: "promoted", label: "Promoted", valueType: "boolean" },
    { id: "url", label: "Link", valueType: "url" },
    { id: "details", label: "Details", valueType: "json" },
    { id: "secret", label: "Secret", valueType: "string", handling: "exclude" }
  ],
  primaryKey: ["id", "region"]
};

function collected(values: readonly Record<string, unknown>[], batchKey = "capture") {
  return values.map((entry) => ({ values: entry, nodeId: "read", batchKey }));
}

function automatic(values: readonly Record<string, unknown>[], process?: AutomationStudioRecordProcessing, schema = SCHEMA) {
  return processAutomationStudioRecordRows({ mode: "automatic", rows: collected(values), schema, ...(process ? { process } : {}), now: NOW });
}

describe("automatic processing in the existing evaluator", () => {
  it("filters actual occurrence evidence before identity, preserves originals and projects once", () => {
    const original = [
      { id: "same", region: "north", title: "Promoted offer", promoted: true, price: "$2", secret: "hidden", extra: "unmodeled" },
      { id: "same", region: "north", title: "Organic offer", promoted: false, price: "$12", secret: "hidden", extra: "unmodeled" },
      { id: "other", region: "north", title: "Other offer", promoted: false, price: "$30" }
    ];
    const snapshot = structuredClone(original);
    const result = automatic(original, { where: [{ field: "promoted", equals: "false" }], sort: [{ field: "price", order: "asc", as: "number" }], columns: ["title"], limit: 1 });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected ready");
    expect(result.rows).toEqual([{ title: "Organic offer" }]);
    expect(result.retainedRows).toEqual([{ id: "same", region: "north", title: "Organic offer", promoted: false, price: "$12" }]);
    expect(result.account).toMatchObject({ collected: 3, filteredOut: 1, duplicates: 0, cut: 1, kept: 1 });
    expect(original).toEqual(snapshot);
  });

  it("uses a complete primary key independently of display columns and keeps one real representative", () => {
    const first = { id: "one", region: "north", title: "Same", price: "$12" };
    const result = automatic([first, { ...first, price: "$9" }, { ...first, id: "two" }], { columns: ["title"] });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected ready");
    expect(result.rows).toEqual([{ title: "Same" }, { title: "Same" }]);
    expect(result.retainedRows).toEqual([first, { ...first, id: "two" }]);
    expect(result.account.duplicates).toBe(1);
  });

  it("falls back from incomplete composite identity to the entire original allowed row", () => {
    const first = { id: "one", title: "Same", price: "$12", secret: "a" };
    const result = automatic([first, { ...first, price: "$9" }, { ...first, secret: "b" }], { columns: ["title"], derive: [{ id: "amount", from: "price", as: "number" }] });
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected ready");
    expect(result.retainedRows).toEqual([{ id: "one", title: "Same", price: "$12" }, { id: "one", title: "Same", price: "$9" }]);
    expect(result.account.duplicates).toBe(1);
  });

  it("uses whole originals without a validated key and never guesses shared links as identity", () => {
    const schema: AutomationStudioRecordSchema = { schemaVersion: SCHEMA.schemaVersion, fields: SCHEMA.fields };
    const result = automatic([{ title: "One", url: "/shared" }, { title: "Two", url: "/shared" }], { columns: ["url"] }, schema);
    expect(result.state).toBe("ready");
    if (result.state !== "ready") throw new Error("Expected ready");
    expect(result.rows).toHaveLength(2);
    expect(result.account.duplicates).toBe(0);
  });

  it("preserves explicit identity and explicit no-dedupe", () => {
    const values = [{ id: "one", title: "One" }, { id: "one", title: "Two" }];
    const explicit = automatic(values, { dedupe: { by: ["id"] } });
    const repeated = automatic(values, { dedupe: false });
    expect(explicit.state === "ready" && explicit.rows).toEqual([values[0]]);
    expect(repeated.state === "ready" && repeated.rows).toEqual(values);
  });

  it("falls back to original evidence when an explicit derived composite key is incomplete", () => {
    const result = automatic([{ id: "same", title: "One", price: "ask" }, { id: "same", title: "Two", price: "ask" }], {
      derive: [{ id: "amount", from: "price", as: "number" }], dedupe: { by: ["id", "amount"] }, columns: ["price"]
    });
    expect(result.state === "ready" && result.retainedRows).toEqual([{ id: "same", title: "One", price: "ask" }, { id: "same", title: "Two", price: "ask" }]);
  });

  it.each([undefined, null, "", "ask", { amount: 20 }])("returns no success rows for required negative numeric evidence %j", (price) => {
    const result = automatic([{ title: "Unknown", ...(price === undefined ? {} : { price }) }], { where: [{ field: "price", atMost: 10, not: true }] });
    expect(result.state).toBe("missing-evidence");
    expect(result).not.toHaveProperty("rows");
    expect(result).not.toHaveProperty("retainedRows");
    if (result.state !== "missing-evidence") throw new Error("Expected missing evidence");
    expect(result.missingEvidence).toEqual([{ operator: "where", index: 0, field: "price", reason: price === undefined || price === null || price === "" ? "missing" : "unreadable", source: { nodeId: "read", batchKey: "capture", row: 0 } }]);
  });

  it("does not manufacture a negative flag from a missing value", () => {
    const result = automatic([{ title: "Unknown" }], { where: [{ field: "promoted", equals: "true", not: true }] });
    expect(result.state).toBe("missing-evidence");
    const knownFalse = automatic([{ title: "Organic", promoted: false }], { where: [{ field: "promoted", equals: "true", not: true }] });
    expect(knownFalse.state === "ready" && knownFalse.rows).toEqual([{ title: "Organic", promoted: false }]);
  });

  it("keeps explicit absence criteria and short-circuits a known false conjunct", () => {
    const absent = automatic([{ title: "No badge" }], { where: [{ field: "promoted", is: "absent" }] });
    expect(absent.state).toBe("ready");
    const result = automatic([{ title: "Excluded", promoted: true }, { title: "Qualified", promoted: false, price: "$9" }], {
      where: [{ field: "price", atMost: 10 }, { field: "promoted", equals: "false" }]
    });
    expect(result.state === "ready" && result.rows).toEqual([{ title: "Qualified", promoted: false, price: "$9" }]);
  });

  it.each([false, true])("explicit false presence settles its numeric conjunction with not=%s", (not) => {
    const condition = parseAutomationStudioRecordCondition({ field: "price", is: "present", atMost: 10, not });
    expect(condition).not.toBeNull();
    if (!condition) throw new Error("Expected an accepted condition");
    for (const values of [{ title: "Missing" }, { title: "Null", price: null }, { title: "Blank", price: "  " }]) {
      const result = automatic([values], { where: [condition] });
      expect(result.state).toBe(not ? "ready" : "empty");
      if (result.state === "ready") expect(result.retainedRows).toEqual([values]);
    }
  });

  it("explicit true presence still requires a readable comparison", () => {
    for (const not of [false, true]) {
      const result = automatic([{ title: "Present unreadable", price: "ask" }], { where: [{ field: "price", is: "present", atMost: 10, not }] });
      expect(result.state).toBe("missing-evidence");
    }
    expect(automatic([{ price: "$9" }], { where: [{ field: "price", is: "present", atMost: 10 }] }).state).toBe("ready");
    expect(automatic([{ price: "$12" }], { where: [{ field: "price", is: "present", atMost: 10 }] }).state).toBe("empty");
  });

  it.each([false, true])("an implicit missing comparison remains unknown with not=%s", (not) => {
    const result = automatic([{ title: "Missing" }], { where: [{ field: "price", atMost: 10, not }] });
    expect(result.state).toBe("missing-evidence");
    expect(result).not.toHaveProperty("rows");
  });

  it.each([false, true])("explicit presence preserves unreadable-date safety with not=%s", (not) => {
    for (const date of [undefined, "ask", "02/03/2026"]) {
      const result = automatic([{ title: "Unknown date", ...(date === undefined ? {} : { date }) }], {
        where: [{ field: "date", is: "present", atLeast: "2026-03-01", contains: "wanted", not }]
      });
      expect(result.state).toBe("missing-evidence");
      expect(result).not.toHaveProperty("rows");
    }
  });

  it("short-circuits a proven true OR branch but reports unknown branches that could qualify", () => {
    const process = { anyOf: [[{ field: "title", contains: "wanted" }, { field: "count", atLeast: 5 }]] };
    expect(automatic([{ title: "Wanted row" }], process).state).toBe("ready");
    const unknown = automatic([{ title: "Other row" }], process);
    expect(unknown.state === "missing-evidence" && unknown.missingEvidence).toEqual([{ operator: "anyOf", index: 0, condition: 1, field: "count", reason: "missing", source: { nodeId: "read", batchKey: "capture", row: 0 } }]);
  });

  it("preserves short-circuit truth within a multi-comparison condition and its negation", () => {
    const values = [{ title: "Other" }];
    expect(automatic(values, { where: [{ field: "title", contains: "Wanted", atLeast: 5 }] })).toMatchObject({ state: "empty", reason: "no_matches" });
    expect(automatic(values, { where: [{ field: "title", contains: "Wanted", atLeast: 5, not: true }] }).state).toBe("ready");
    expect(automatic([{ title: "Wanted" }], { where: [{ field: "title", contains: "Wanted", atLeast: 5 }] }).state).toBe("missing-evidence");
  });

  it("preserves known equality alternatives without guessing unreadable numeric alternatives", () => {
    const process = { where: [{ field: "price", equals: [10, "free"] }] };
    expect(automatic([{ price: "free" }], process).state).toBe("ready");
    expect(automatic([{ price: "$10" }], process).state).toBe("ready");
    expect(automatic([{ price: "ask" }], process).state).toBe("missing-evidence");
  });

  it("reports both unreadable comparison sides with their declaration and capture references", () => {
    const result = processAutomationStudioRecordRows({ mode: "automatic", schema: SCHEMA, rows: [...collected([{ title: "Valid", price: "$10", previous: "$20" }]), ...collected([{ title: "Unknown", price: "ask" }], "next")], process: { compare: [{ field: "price", lessThan: "previous", not: true }] }, now: NOW });
    expect(result.state === "missing-evidence" && result.missingEvidence).toEqual([
      { operator: "compare", index: 0, field: "price", reason: "unreadable", source: { nodeId: "read", batchKey: "next", row: 0 } },
      { operator: "compare", index: 0, field: "previous", reason: "missing", source: { nodeId: "read", batchKey: "next", row: 0 } }
    ]);
  });

  it("preserves a known false field comparison within multiple comparisons and their negation", () => {
    const values = [{ title: "Other", price: "$10", previous: "$20" }];
    expect(automatic(values, { compare: [{ field: "price", greaterThan: "previous", lessThan: "count" }] })).toMatchObject({ state: "empty", reason: "no_matches" });
    expect(automatic(values, { compare: [{ field: "price", greaterThan: "previous", lessThan: "count", not: true }] }).state).toBe("ready");
  });

  it("requires sort evidence before limit, including hidden keys and derived source references", () => {
    const result = automatic([{ title: "Readable", price: "$10" }, { title: "Unknown", price: "ask" }], {
      derive: [{ id: "amount", from: "price", as: "number" }], sort: [{ field: "amount", as: "number", order: "asc" }], columns: ["title"], limit: 1
    });
    expect(result.state === "missing-evidence" && result.missingEvidence).toEqual([{ operator: "sort", index: 0, field: "amount", from: "price", reason: "missing", source: { nodeId: "read", batchKey: "capture", row: 1 } }]);
  });

  it("reads typed currencies, counts and relative dates with the supplied run clock", () => {
    const values = [
      { title: "Old", price: "$1,200", count: "1.2k", date: "8 days ago" },
      { title: "Recent", price: "$1,100", count: "2k", date: "2 days ago" },
      { title: "Newest", price: "$900", count: "1.5k", date: "1 day ago" }
    ];
    const process: AutomationStudioRecordProcessing = { where: [{ field: "price", atMost: 1200 }, { field: "count", atLeast: 1200 }, { field: "date", within: "7 days" }], sort: [{ field: "date", as: "date", order: "desc" }], columns: ["title", "price"] };
    const live = automatic(values, process);
    const replay = automatic(structuredClone(values), structuredClone(process));
    expect(live).toEqual(replay);
    expect(live.state === "ready" && live.rows).toEqual([{ title: "Newest", price: "$900" }, { title: "Recent", price: "$1,100" }]);
  });

  it("does not count ambiguous or unreadable dates as negative matches", () => {
    const result = automatic([{ title: "Ambiguous", date: "02/03/2026" }], { where: [{ field: "date", atLeast: "2026-03-01", not: true }] });
    expect(result.state === "missing-evidence" && result.missingEvidence[0]).toMatchObject({ operator: "where", field: "date", reason: "unreadable" });
  });

  it("requires declared output values while retaining structured JSON and real false flags", () => {
    const ready = automatic([{ title: "One", promoted: false, details: { status: "open" } }], { columns: ["title", "promoted", "details"] });
    expect(ready.state === "ready" && ready.rows).toEqual([{ title: "One", promoted: false, details: { status: "open" } }]);
    const missing = automatic([{ title: "One" }], { columns: ["title", "price"] });
    expect(missing.state === "missing-evidence" && missing.missingEvidence[0]).toMatchObject({ operator: "columns", index: 1, field: "price", reason: "missing" });
  });

  it("reports empty collection and known nonmatches separately from ready answers", () => {
    expect(automatic([])).toMatchObject({ state: "empty", reason: "uncollected", account: { collected: 0, kept: 0 } });
    expect(automatic([{ title: "Other" }], { where: [{ field: "title", equals: "Wanted" }] })).toMatchObject({ state: "empty", reason: "no_matches", account: { collected: 1, filteredOut: 1, kept: 0 } });
    expect(automatic([])).not.toHaveProperty("rows");
  });

  it("permits explicitly empty processing without asserting task success", () => {
    expect(automatic([], { minRows: 0 })).toMatchObject({ state: "ready", rows: [], retainedRows: [], account: { collected: 0, kept: 0, keptNone: true } });
    expect(automatic([{ title: "Other" }], { minRows: 0, where: [{ field: "title", equals: "Wanted" }] })).toMatchObject({ state: "ready", rows: [], account: { collected: 1, filteredOut: 1, kept: 0 } });
  });

  it("keeps legacy saved processing's display identity and negative missing-value behavior", () => {
    const values = [{ title: "Same", price: "$12" }, { title: "Same", price: "$9" }];
    expect(processAutomationStudioRecordRows({ rows: collected(values), schema: SCHEMA, process: { columns: ["title"] }, now: NOW }).rows).toEqual([{ title: "Same" }]);
    expect(processAutomationStudioRecordRows({ mode: "legacy", rows: collected([{ title: "Unknown" }]), schema: SCHEMA, process: { where: [{ field: "price", atMost: 10, not: true }] }, now: NOW }).rows).toEqual([{ title: "Unknown" }]);
  });
});
