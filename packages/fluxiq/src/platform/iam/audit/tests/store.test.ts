// @fluxiq-test-group real-sql
import { mkdtempSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { IamAuditRecord } from "../../types.ts";
import { IamAuditStore } from "../store.ts";

const DAY = 86_400;
const T0 = Date.UTC(2026, 9, 1) / 1000;

function record(over: Partial<IamAuditRecord> = {}): IamAuditRecord {
  return {
    category: "allow",
    time: T0 + 10,
    requestId: "42",
    principal: "frn:fluxiq:iam:ws1:user/ada",
    action: "fluxiq:RunFlow",
    resources: ["frn:fluxiq:flows:ws1:flow/a", "frn:fluxiq:flows:ws1:flow/b"],
    decision: "allow",
    matched: { policy: "FluxIQFullAccess", sid: "All" },
    origin: "api",
    ipPrefix: "203.0.113.0/24",
    ...over
  };
}

function fileSize(file: string): number {
  return statSync(file, { throwIfNoEntry: false })?.size ?? 0;
}

let dir = "";
let store: IamAuditStore;

beforeEach(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "iam-audit-"));
  store = await IamAuditStore.open(path.join(dir, "audit.db"));
});

afterEach(async () => {
  await store.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("IamAuditStore", () => {
  it("round-trips every field of every category", async () => {
    const rows: IamAuditRecord[] = [
      record(),
      record({ category: "deny", decision: "deny", time: T0 + 20, requestId: "req-abc", matched: "implicit", ipPrefix: null, resources: [] }),
      record({ category: "iam-change", decision: "allow", time: T0 + 30, matched: { policy: "P", sid: null }, action: "fluxiq:AttachPolicy", origin: "panel" })
    ];
    await store.write(rows);
    const back = await store.read();
    expect(back).toEqual([...rows].reverse());
  });

  it("partitions allow rows by UTC day across midnight", async () => {
    await store.write([record({ time: T0 + DAY - 1 }), record({ time: T0 + DAY }), record({ time: T0 + DAY + 5 })]);
    expect(store.allowTables()).toEqual(["allow_20261001", "allow_20261002"]);
    expect((await store.read({ since: T0 + DAY })).map((r) => r.time)).toEqual([T0 + DAY + 5, T0 + DAY]);
    expect((await store.read({ until: T0 + DAY })).map((r) => r.time)).toEqual([T0 + DAY - 1]);
  });

  it("filters by principal, categories and limit, newest first", async () => {
    await store.write([
      record({ time: T0 + 1, principal: "a" }),
      record({ time: T0 + 2, principal: "b" }),
      record({ time: T0 + 3, principal: "a", category: "deny", decision: "deny" }),
      record({ time: T0 + 4, principal: "a" })
    ]);
    expect((await store.read({ principal: "a" })).map((r) => r.time)).toEqual([T0 + 4, T0 + 3, T0 + 1]);
    expect((await store.read({ principal: "a", categories: ["deny"] })).map((r) => r.time)).toEqual([T0 + 3]);
    expect((await store.read({ limit: 2 })).map((r) => r.time)).toEqual([T0 + 4, T0 + 3]);
    expect(await store.read({ principal: "nobody" })).toEqual([]);
  });

  it("reopens with its dictionary and tables intact", async () => {
    await store.write([record()]);
    await store.close();
    store = await IamAuditStore.open(path.join(dir, "audit.db"));
    await store.write([record({ time: T0 + 11 })]);
    expect((await store.read()).map((r) => r.principal)).toEqual(["frn:fluxiq:iam:ws1:user/ada", "frn:fluxiq:iam:ws1:user/ada"]);
  });

  it("expires whole day tables and old long rows", async () => {
    await store.write([
      record({ time: T0 }),
      record({ time: T0 + 100 * DAY }),
      record({ category: "deny", decision: "deny", time: T0 }),
      record({ category: "iam-change", time: T0 + 150 * DAY })
    ]);
    const result = await store.expire(T0 + 180 * DAY, { allowDays: 90, longDays: 100 });
    expect(result).toEqual({ droppedTables: 1, deletedRows: 1 });
    expect(store.allowTables()).toEqual(["allow_20270109"]);
    expect((await store.read({ categories: ["deny", "iam-change"] })).map((r) => r.category)).toEqual(["iam-change"]);
  });

  it("rolls back a failed batch and reuses its dictionary ids", async () => {
    await expect(store.write([record({ principal: "fresh" }), record({ time: Number.NaN })])).rejects.toThrow();
    await store.write([record({ principal: "fresh" })]);
    expect((await store.read({ principal: "fresh" })).length).toBe(1);
    expect((await store.read()).length).toBe(1);
  });

  it("keeps 10,000 polling-like allow rows under 80 bytes each", async () => {
    const rows = Array.from({ length: 10_000 }, (_, i) => record({
      time: T0 + i,
      requestId: String(1_000_000 + i),
      principal: `frn:fluxiq:iam:ws1:user/user${i % 20}`,
      action: i % 2 === 0 ? "fluxiq:GetRun" : "fluxiq:ListRuns",
      resources: [`frn:fluxiq:flows:ws1:run/${i % 50}`]
    }));
    await store.write(rows);
    await store.close();
    const file = path.join(dir, "audit.db");
    const bytes = fileSize(file) + fileSize(`${file}-wal`);
    const perRow = bytes / rows.length;
    console.info(`audit size: ${bytes} bytes, ${perRow.toFixed(1)} bytes/row (main ${fileSize(file)}, wal ${fileSize(`${file}-wal`)})`);
    expect(perRow).toBeLessThan(80);
    store = await IamAuditStore.open(file);
    const started = performance.now();
    const found = await store.read({ principal: "frn:fluxiq:iam:ws1:user/user3", limit: 100_000 });
    console.info(`principal read over 10,000 rows without an index: ${(performance.now() - started).toFixed(1)} ms, ${found.length} rows`);
    expect(found).toHaveLength(500);
  });
});
