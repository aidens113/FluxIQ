import { describe, expect, it } from "vitest";
import { RepositoryPlatformStore } from "../repository/index.ts";
import { FakeRecordRepository } from "./fake-record-repository.ts";
import { account, runPlatformStoreSuite, token } from "./platform-store-suite.ts";

runPlatformStoreSuite("RepositoryPlatformStore", () => new RepositoryPlatformStore(new FakeRecordRepository()));

describe("RepositoryPlatformStore storage", () => {
  it("writes platform-kind rows at platform scope with index rows, and never a raw secret field", async () => {
    const repository = new FakeRecordRepository();
    const store = new RepositoryPlatformStore(repository, () => 42);
    await store.putAccount(account("u1", "A@example.com", { externalId: "ext" }));
    await store.putLinkToken(token("digest", "u1"));
    const rows = [...repository.rows.values()];
    expect(rows.every((row) => row.kind.startsWith("platform.") && row.scope.domainId === null)).toBe(true);
    expect(rows.map((row) => row.id).sort()).toEqual(["account/u1", "email/a%40example.com", "external/ext", "link-token/digest"]);
    expect(repository.rows.get("|email/a%40example.com")?.data).toEqual({ userId: "u1" });
    expect(JSON.stringify(rows)).not.toMatch(/"password":|sessionId|rawToken/);
    expect(rows.every((row) => row.updatedAtMs === 42)).toBe(true);
  });

  it("finds an account by email with a get, not a scan", async () => {
    const repository = new FakeRecordRepository();
    const store = new RepositoryPlatformStore(repository);
    await store.putAccount(account("u1", "a@example.com", { externalId: "ext" }));
    let listed = 0;
    const original = repository.list.bind(repository);
    repository.list = async (scope) => {
      listed += 1;
      return original(scope);
    };
    await store.findAccountByEmail("a@example.com");
    await store.findAccountByExternalId("ext");
    expect(listed).toBe(0);
  });

  it("ignores a stale index row whose account is gone", async () => {
    const repository = new FakeRecordRepository();
    const store = new RepositoryPlatformStore(repository);
    await store.putAccount(account("u1", "a@example.com"));
    repository.rows.delete("|account/u1");
    expect(await store.findAccountByEmail("a@example.com")).toBeNull();
    await store.putAccount(account("u2", "a@example.com"));
    expect((await store.findAccountByEmail("a@example.com"))?.userId).toBe("u2");
  });

  it("lets a second store over the same repository see writes, with no caching", async () => {
    const repository = new FakeRecordRepository();
    const first = new RepositoryPlatformStore(repository);
    const second = new RepositoryPlatformStore(repository);
    expect(await second.getAccount("u1")).toBeNull();
    await first.putAccount(account("u1", "a@example.com"));
    expect((await second.findAccountByEmail("a@example.com"))?.userId).toBe("u1");
    await first.putLinkToken(token("d1", "u1"));
    expect(await second.consumeLinkToken("d1", "welcome", 5)).not.toBeNull();
    expect(await first.consumeLinkToken("d1", "welcome", 6)).toBeNull();
    await second.deleteAccount("u1");
    expect(await first.getAccount("u1")).toBeNull();
  });
});
