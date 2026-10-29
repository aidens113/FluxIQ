// @fluxiq-test-group real-sql
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import { SQLiteRepository } from "../../../programs/database-manager/storage/sqlite-repository.ts";
import { createPlatformStore } from "../create-platform-store.ts";
import { PlatformStoreConflictError } from "../errors/index.ts";
import { account, membership, token } from "./platform-store-suite.ts";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

it("persists accounts, indexes, memberships and tokens through a real SQLiteRepository", async () => {
  const rootDir = await mkdtemp(path.join(os.tmpdir(), "fluxiq-platform-store-"));
  roots.push(rootDir);
  const store = createPlatformStore({ repository: new SQLiteRepository({ rootDir, kind: "platform.store" }) });
  await store.putAccount(account("u1", "Ann@Example.com", { externalId: "ext" }));
  await store.putMembership(membership("w1", "u1"));
  await store.putLinkToken(token("d1", "u1"));

  const reopened = createPlatformStore({ repository: new SQLiteRepository({ rootDir, kind: "platform.store" }) });
  expect((await reopened.findAccountByEmail("ann@example.com"))?.userId).toBe("u1");
  expect((await reopened.findAccountByExternalId("ext"))?.userId).toBe("u1");
  await expect(reopened.putAccount(account("u2", "ann@example.com"))).rejects.toBeInstanceOf(PlatformStoreConflictError);
  expect(await reopened.consumeLinkToken("d1", "welcome", 10)).not.toBeNull();
  expect(await store.consumeLinkToken("d1", "welcome", 11)).toBeNull();

  await reopened.putAccount(account("u1", "new@example.com", { externalId: "ext" }));
  expect(await store.findAccountByEmail("ann@example.com")).toBeNull();
  expect(await store.deleteAccount("u1")).toBe(true);
  expect(await reopened.listMembershipsOfUser("u1")).toEqual([]);
  expect(await reopened.listAccounts()).toEqual([]);
});
