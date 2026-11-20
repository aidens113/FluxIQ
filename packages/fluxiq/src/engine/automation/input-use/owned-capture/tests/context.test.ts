import { describe, expect, it } from "vitest";
import type { JsonObject } from "../../../../../core/index.ts";
import type { AutomationStudioRecordBatch } from "../../../index.ts";
import { automationStudioRecordTraceSummary } from "../../../records/index.ts";
import { AutomationStudioInputUseOwnedCapture as Owned } from "../index.ts";

function owner(rows: JsonObject[]) {
  const records = automationStudioRecordTraceSummary();
  const batch: AutomationStudioRecordBatch = { nodeId: "extract", attemptId: "extract.attempt.1", batchKey: "extract.attempt.1", datasetId: "synthetic-dataset", writeMode: "append",
    schema: { schemaVersion: "0.1", fields: [{ id: "name", label: "Name", valueType: "string" }] }, rows, invalidCount: 0, truncated: false };
  records.record(batch);
  return records;
}

describe("owned captured-record context of original handoff objects", () => {
  it("finds a captured array or row at any depth by identity", () => {
    const rows = [{ name: "synthetic-row-one" }, { name: "synthetic-row-two" }];
    const records = owner(rows);
    expect(Owned.inspect(records, { inputs: { items: rows } })).toBe("captured");
    expect(Owned.inspect(records, { inputs: { nested: [{ deeper: { row: rows[1] } }] } })).toBe("captured");
    let deep: unknown = rows[0];
    for (let level = 0; level < 100_000; level += 1) deep = { level: deep };
    expect(Owned.inspect(records, deep)).toBe("captured");
  });

  it("leaves equal-valued but independently built data clear, and answers for cycles", () => {
    const rows = [{ name: "synthetic-row-one" }];
    const records = owner(rows);
    expect(Owned.inspect(records, { items: [{ name: "synthetic-row-one" }] })).toBe("clear");
    const cycle: Record<string, unknown> = { name: "synthetic-row-one" };
    cycle.self = cycle;
    expect(Owned.inspect(records, { cycle, shared: [cycle, cycle] })).toBe("clear");
    cycle.row = rows[0];
    expect(Owned.inspect(records, { cycle })).toBe("captured");
  });

  it("answers clear when the live owner captured nothing", () => {
    expect(Owned.inspect(automationStudioRecordTraceSummary(), { items: [{ name: "synthetic" }], odd: new Date(0) })).toBe("clear");
  });

  it("keeps an inspection that cannot answer unavailable, without running accessors", () => {
    const records = owner([{ name: "synthetic-row-one" }]);
    let ran = 0;
    const accessor = Object.defineProperty({}, "hidden", { enumerable: true, get: () => {
      ran += 1;
      return "synthetic";
    } });
    const revoked = Proxy.revocable({}, {});
    revoked.revoke();
    expect(Owned.inspect(undefined, { items: [] })).toBe("unavailable");
    expect(Owned.inspect({ captured: () => { throw new Error("synthetic-owner-failure"); } }, { items: [] })).toBe("unavailable");
    expect(Owned.inspect(records, { accessor })).toBe("unavailable");
    expect(ran).toBe(0);
    expect(Owned.inspect(records, { when: new Date(0) })).toBe("unavailable");
    expect(Owned.inspect(records, { revoked: revoked.proxy })).toBe("unavailable");
  });
});
