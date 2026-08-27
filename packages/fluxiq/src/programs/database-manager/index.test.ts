import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRecord, DatabaseManagerService, SQLiteRepository } from "./index.ts";

describe("SQLiteRepository", () => {
  it("stores and lists global records", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { title: "Alpha" }, nowMs: 1000 }));

      const rows = await repo.list();

      expect(rows).toHaveLength(1);
      expect(rows[0]?.id).toBe("alpha");
      expect(rows[0]?.data.title).toBe("Alpha");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("keeps domain-scoped records isolated", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await repo.put(createRecord({ id: "shared", kind: "widgets", data: { title: "Global" } }));
      await repo.put(createRecord({ id: "shared", kind: "widgets", scope: { domainId: "Example" }, data: { title: "Domain" } }));

      expect((await repo.get("shared"))?.data.title).toBe("Global");
      expect((await repo.get("shared", { domainId: "example" }))?.data.title).toBe("Domain");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("preserves created time when updating records", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { count: 1 }, nowMs: 1000 }));
      const updated = await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { count: 2 }, nowMs: 2000 }));

      expect(updated.createdAtMs).toBe(1000);
      expect(updated.updatedAtMs).toBeGreaterThanOrEqual(1000);
      expect(updated.data.count).toBe(2);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("deletes records", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await repo.put(createRecord({ id: "alpha", kind: "widgets", data: { title: "Alpha" } }));

      expect(await repo.delete("alpha")).toBe(true);
      expect(await repo.delete("alpha")).toBe(false);
      expect(await repo.get("alpha")).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("creates global and domain sqlite database files", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await repo.put(createRecord({ id: "global", kind: "widgets", data: { title: "Global" } }));
      await repo.put(createRecord({ id: "domain", kind: "widgets", scope: { domainId: "example" }, data: { title: "Domain" } }));

      expect(repo.databases()).toEqual(["example", "global"]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("filters, sorts, counts, and pages records in SQLite", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await Promise.all(Array.from({ length: 130 }, (_, index) => repo.put(createRecord({
        id: "item-" + String(index).padStart(3, "0"),
        kind: "widgets",
        data: { title: index % 10 === 0 ? "Needle " + index : "Ordinary " + index }
      }))));

      const capped = await repo.listPage({}, { limit: 500, offset: 0, orderBy: "id", direction: "asc" });
      expect(capped.total).toBe(130);
      expect(capped.records).toHaveLength(100);
      expect(capped.records[0]?.id).toBe("item-000");
      const second = await repo.listPage({}, { limit: 25, offset: 100, orderBy: "id", direction: "asc" });
      expect(second.records[0]?.id).toBe("item-100");
      const filtered = await repo.listPage({}, { limit: 10, search: "Needle", orderBy: "id", direction: "asc" });
      expect(filtered.total).toBe(13);
      expect(filtered.records.every((record) => String(record.data.title).includes("Needle"))).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("does not query or expose sensitive store counts in snapshots", async () => {
    let listCalls = 0;
    const service = new DatabaseManagerService().registerRepository("identity.users", {
      list: async () => { listCalls += 1; return []; },
      get: async () => null,
      put: async (record) => record,
      delete: async () => false
    });

    const snapshot = await service.snapshot();
    expect(snapshot.stores[0]?.recordCount).toBeNull();
    expect(listCalls).toBe(0);
  });

  it("waits for concurrent access instead of failing with SQLITE_BUSY", async () => {
    const root = await tempRoot();
    try {
      const repo = new SQLiteRepository({ rootDir: root, kind: "widgets" });
      await Promise.all(Array.from({ length: 20 }, (_, index) => repo.put(createRecord({
        id: `item-${index}`,
        kind: "widgets",
        data: { index }
      }))));

      expect(await repo.list()).toHaveLength(20);
    } finally {
      await delay(100);
      await rm(root, { recursive: true, force: true });
    }
  });
});

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "fluxiq-data-"));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
