// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../../framework/persistence/repository/sqlite-repository.ts";
import { PlatformRecords } from "../repository/index.ts";
import { FakeRecordRepository } from "./fake-record-repository.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("PlatformRecords.put", () => {
  it("is one repository operation, with no read before the write", async () => {
    const repository = new FakeRecordRepository();
    const calls: string[] = [];
    for (const name of ["get", "put", "list", "delete"] as const) {
      const original = repository[name].bind(repository) as (...args: never[]) => unknown;
      (repository as unknown as Record<string, unknown>)[name] = (...args: never[]) => {
        calls.push(name);
        return original(...args);
      };
    }
    const records = new PlatformRecords(repository, () => 7);
    await records.put("account", "u1", { userId: "u1" });
    expect(calls).toEqual(["put"]);
    expect(await records.get("account", "u1")).toEqual({ userId: "u1" });
  });

  it("over SQLite keeps the row's creation time when it is written again", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-platform-records-"));
    roots.push(rootDir);
    const repository = new SQLiteRepository({ rootDir, kind: "platform.store" });
    let clock = 100;
    const records = new PlatformRecords(repository, () => clock);
    await records.put("account", "u1", { n: 1 });
    clock = 900;
    await records.put("account", "u1", { n: 2 });
    const row = await repository.get("account/u1", { domainId: null });
    expect(row?.data).toEqual({ n: 2 });
    expect(row?.createdAtMs).toBe(100);
  });
});
