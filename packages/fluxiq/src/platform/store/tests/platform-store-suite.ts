import { describe, expect, it } from "vitest";
import { PlatformStoreConflictError } from "../errors/index.ts";
import type { PlatformAccountRecord, PlatformLinkTokenRecord, PlatformMembershipRecord, PlatformStore } from "../types.ts";

export function account(userId: string, email: string, overrides: Partial<PlatformAccountRecord> = {}): PlatformAccountRecord {
  return {
    userId,
    email,
    emailVerifiedAtMs: null,
    displayName: userId,
    externalId: null,
    identities: [{ provider: "password", subject: email }],
    status: "active",
    disabledReason: null,
    createdVia: "in-process",
    termsVersion: null,
    createdAtMs: 1,
    updatedAtMs: 1,
    lastSignInAtMs: null,
    deletion: null,
    ...overrides
  };
}

export function membership(workspaceId: string, userId: string): PlatformMembershipRecord {
  return { workspaceId, userId, policies: ["WorkspaceMember"], groups: [], status: "active", createdAtMs: 1, updatedAtMs: 1 };
}

export function token(tokenDigest: string, userId: string, overrides: Partial<PlatformLinkTokenRecord> = {}): PlatformLinkTokenRecord {
  return { tokenDigest, purpose: "welcome", userId, continueUrl: null, createdAtMs: 1, expiresAtMs: 1000, usedAtMs: null, ...overrides };
}

/** The behaviour every `PlatformStore` implementation must show. `create` returns a fresh, empty store. */
export function runPlatformStoreSuite(name: string, create: () => PlatformStore): void {
  describe(`${name}: accounts`, () => {
    it("puts, gets, lists and finds an account by email and externalId", async () => {
      const store = create();
      await store.putAccount(account("u1", "Ann@Example.com", { externalId: "ext-1" }));
      await store.putAccount(account("u2", "bob@example.com"));
      expect((await store.getAccount("u1"))?.email).toBe("ann@example.com");
      expect((await store.findAccountByEmail("  ANN@example.COM "))?.userId).toBe("u1");
      expect((await store.findAccountByExternalId("ext-1"))?.userId).toBe("u1");
      expect(await store.findAccountByExternalId("nope")).toBeNull();
      expect(await store.findAccountByEmail("nobody@example.com")).toBeNull();
      expect(await store.getAccount("missing")).toBeNull();
      expect((await store.listAccounts()).map((a) => a.userId).sort()).toEqual(["u1", "u2"]);
    });

    it("does not let a caller mutate stored state through a returned record", async () => {
      const store = create();
      await store.putAccount(account("u1", "a@example.com"));
      const first = await store.getAccount("u1");
      first!.displayName = "changed";
      expect((await store.getAccount("u1"))?.displayName).toBe("u1");
    });

    it("rejects an email used by another account, in any case", async () => {
      const store = create();
      await store.putAccount(account("u1", "a@example.com"));
      const error = await store.putAccount(account("u2", "A@Example.com")).then(
        () => null,
        (failure: unknown) => failure
      );
      expect(error).toBeInstanceOf(PlatformStoreConflictError);
      expect((error as PlatformStoreConflictError).field).toBe("email");
      expect(await store.getAccount("u2")).toBeNull();
    });

    it("rejects an externalId used by another account", async () => {
      const store = create();
      await store.putAccount(account("u1", "a@example.com", { externalId: "ext" }));
      const error = await store.putAccount(account("u2", "b@example.com", { externalId: "ext" })).then(
        () => null,
        (failure: unknown) => failure
      );
      expect(error).toBeInstanceOf(PlatformStoreConflictError);
      expect((error as PlatformStoreConflictError).field).toBe("externalId");
      expect(await store.findAccountByEmail("b@example.com")).toBeNull();
    });

    it("lets the same account be rewritten with its own email and externalId", async () => {
      const store = create();
      await store.putAccount(account("u1", "a@example.com", { externalId: "ext" }));
      await store.putAccount(account("u1", "a@example.com", { externalId: "ext", displayName: "Renamed" }));
      expect((await store.findAccountByEmail("a@example.com"))?.displayName).toBe("Renamed");
    });

    it("moves the email and externalId indexes when they change", async () => {
      const store = create();
      await store.putAccount(account("u1", "old@example.com", { externalId: "old-ext" }));
      await store.putAccount(account("u1", "new@example.com", { externalId: null }));
      expect(await store.findAccountByEmail("old@example.com")).toBeNull();
      expect(await store.findAccountByExternalId("old-ext")).toBeNull();
      expect((await store.findAccountByEmail("new@example.com"))?.userId).toBe("u1");
      await store.putAccount(account("u2", "old@example.com", { externalId: "old-ext" }));
      expect((await store.findAccountByEmail("old@example.com"))?.userId).toBe("u2");
    });

    it("deleteAccount removes the account, indexes, memberships and link tokens, and reports absence", async () => {
      const store = create();
      await store.putAccount(account("u1", "a@example.com", { externalId: "ext" }));
      await store.putAccount(account("u2", "b@example.com"));
      await store.putMembership(membership("w1", "u1"));
      await store.putMembership(membership("w1", "u2"));
      await store.putLinkToken(token("d1", "u1"));
      await store.putLinkToken(token("d2", "u1", { purpose: "reset" }));
      await store.putLinkToken(token("d3", "u2"));
      expect(await store.deleteAccount("u1")).toBe(true);
      expect(await store.getAccount("u1")).toBeNull();
      expect(await store.findAccountByEmail("a@example.com")).toBeNull();
      expect(await store.findAccountByExternalId("ext")).toBeNull();
      expect(await store.listMembershipsOfUser("u1")).toEqual([]);
      expect(await store.getLinkToken("d1")).toBeNull();
      expect(await store.getLinkToken("d2")).toBeNull();
      expect(await store.getLinkToken("d3")).not.toBeNull();
      expect((await store.listMembershipsOfWorkspace("w1")).map((m) => m.userId)).toEqual(["u2"]);
      expect(await store.deleteAccount("u1")).toBe(false);
      await store.putAccount(account("u3", "a@example.com", { externalId: "ext" }));
    });
  });

  describe(`${name}: workspaces and memberships`, () => {
    it("puts, gets, lists and deletes workspaces", async () => {
      const store = create();
      await store.putWorkspace({ workspaceId: "w1", kind: "personal", ownerUserId: "u1", createdAtMs: 1 });
      await store.putWorkspace({ workspaceId: "w2", kind: "organisation", ownerUserId: null, createdAtMs: 2 });
      expect((await store.getWorkspace("w1"))?.kind).toBe("personal");
      expect((await store.listWorkspaces()).map((w) => w.workspaceId).sort()).toEqual(["w1", "w2"]);
      expect(await store.deleteWorkspace("w1")).toBe(true);
      expect(await store.deleteWorkspace("w1")).toBe(false);
      expect(await store.getWorkspace("w1")).toBeNull();
    });

    it("puts, gets, lists by user and by workspace, and deletes memberships", async () => {
      const store = create();
      await store.putMembership(membership("w1", "u1"));
      await store.putMembership(membership("w2", "u1"));
      await store.putMembership(membership("w1", "u2"));
      expect((await store.getMembership("w1", "u1"))?.policies).toEqual(["WorkspaceMember"]);
      expect(await store.getMembership("w2", "u2")).toBeNull();
      expect((await store.listMembershipsOfUser("u1")).map((m) => m.workspaceId).sort()).toEqual(["w1", "w2"]);
      expect((await store.listMembershipsOfWorkspace("w1")).map((m) => m.userId).sort()).toEqual(["u1", "u2"]);
      expect(await store.deleteMembership("w1", "u1")).toBe(true);
      expect(await store.deleteMembership("w1", "u1")).toBe(false);
      expect(await store.getMembership("w1", "u1")).toBeNull();
    });
  });

  describe(`${name}: link tokens`, () => {
    it("consumes a live token exactly once", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1"));
      const first = await store.consumeLinkToken("d1", "welcome", 500);
      expect(first?.usedAtMs).toBe(500);
      expect(await store.consumeLinkToken("d1", "welcome", 501)).toBeNull();
      expect((await store.getLinkToken("d1"))?.usedAtMs).toBe(500);
    });

    it("consumes once even when two redemptions race", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1"));
      const results = await Promise.all([store.consumeLinkToken("d1", "welcome", 10), store.consumeLinkToken("d1", "welcome", 10)]);
      expect(results.filter((result) => result !== null)).toHaveLength(1);
    });

    it("refuses a wrong purpose without using the token", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1"));
      expect(await store.consumeLinkToken("d1", "reset", 500)).toBeNull();
      expect((await store.getLinkToken("d1"))?.usedAtMs).toBeNull();
      expect(await store.consumeLinkToken("d1", "welcome", 500)).not.toBeNull();
    });

    it("refuses an expired token, at the expiry instant too, and an unknown one", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1", { expiresAtMs: 1000 }));
      expect(await store.consumeLinkToken("d1", "welcome", 1000)).toBeNull();
      expect(await store.consumeLinkToken("d1", "welcome", 5000)).toBeNull();
      expect(await store.consumeLinkToken("zzz", "welcome", 1)).toBeNull();
      expect(await store.consumeLinkToken("d1", "welcome", 999)).not.toBeNull();
    });

    it("releases a token consumed at that time, which can then be consumed again, and nothing else", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1", { expiresAtMs: 1000 }));
      await store.consumeLinkToken("d1", "welcome", 500);
      expect(await store.releaseLinkToken("d1", 499)).toBe(false);
      expect((await store.getLinkToken("d1"))?.usedAtMs).toBe(500);
      expect(await store.releaseLinkToken("d1", 500)).toBe(true);
      expect((await store.getLinkToken("d1"))?.usedAtMs).toBeNull();
      expect(await store.releaseLinkToken("d1", 500)).toBe(false);
      expect(await store.releaseLinkToken("zzz", 500)).toBe(false);
      expect((await store.consumeLinkToken("d1", "welcome", 600))?.usedAtMs).toBe(600);
      expect(await store.consumeLinkToken("d1", "welcome", 601)).toBeNull();
    });

    it("deleteLinkTokensOf removes only that user's tokens of that purpose and counts them", async () => {
      const store = create();
      await store.putLinkToken(token("d1", "u1"));
      await store.putLinkToken(token("d2", "u1"));
      await store.putLinkToken(token("d3", "u1", { purpose: "reset" }));
      await store.putLinkToken(token("d4", "u2"));
      expect(await store.deleteLinkTokensOf("u1", "welcome")).toBe(2);
      expect(await store.deleteLinkTokensOf("u1", "welcome")).toBe(0);
      expect(await store.getLinkToken("d3")).not.toBeNull();
      expect(await store.getLinkToken("d4")).not.toBeNull();
    });
  });

  describe(`${name}: idempotency`, () => {
    it("returns the first answer for an operation and request id", async () => {
      const store = create();
      const record = { operation: "create-account", requestId: "r/1", inputDigest: "abc", response: { ok: true, nested: [1] }, createdAtMs: 5 };
      await store.putIdempotency(record);
      expect(await store.getIdempotency("create-account", "r/1")).toEqual(record);
      expect(await store.getIdempotency("create-account", "r2")).toBeNull();
      expect(await store.getIdempotency("other", "r/1")).toBeNull();
    });
  });
}
