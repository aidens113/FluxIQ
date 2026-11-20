// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../../../framework/persistence/repository/sqlite-repository.ts";
import { IamRecords } from "../repository/index.ts";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("IamRecords.put", () => {
  it("is one repository operation, with no read before the write", async () => {
    const calls: string[] = [];
    const repository = {
      list: async () => [],
      get: async () => {
        calls.push("get");
        return null;
      },
      put: async (record: never) => {
        calls.push("put");
        return record;
      },
      delete: async () => false
    };
    await new IamRecords(repository, "w1", () => 7).put("policy", "Reader", { name: "Reader" });
    expect(calls).toEqual(["put"]);
  });

  it("over SQLite keeps the row's creation time", async () => {
    const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-iam-records-"));
    roots.push(rootDir);
    const repository = new SQLiteRepository({ rootDir, kind: "platform.iam", layoutVersion: 2 });
    let clock = 100;
    const records = new IamRecords(repository, "w1", () => clock);
    await records.put("policy", "Reader", { n: 1 });
    clock = 900;
    await records.put("policy", "Reader", { n: 2 });
    expect(await records.get("policy", "Reader")).toEqual({ n: 2 });
    const row = await repository.get("policy/Reader", { domainId: "w1" });
    expect(row?.createdAtMs).toBe(100);
  });
});
