import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { createRecord, SQLiteRepository } from "./index";

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
});

async function tempRoot(): Promise<string> {
  return mkdtemp(path.join(os.tmpdir(), "fluxiq-data-"));
}
