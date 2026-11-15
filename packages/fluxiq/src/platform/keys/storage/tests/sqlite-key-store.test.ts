// @fluxiq-test-group real-sql
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { keySessionFixture } from "../../tests/key-session-fixture.ts";
import type { KeySessionIssue } from "../../model/index.ts";
import { competingStoreProcesses } from "./competing-store-processes.ts";
import { readJournalMode } from "./read-journal-mode.ts";
import { createSQLiteKeyStore, type KeyStore } from "../../index.ts";

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
  for (const cleanup of cleanups.splice(0).reverse()) await cleanup();
});

describe("durable SQLite keys and sessions", () => {
  it("initializes rollback journaling under simultaneous fresh connections and retains it on reopen", async () => {
    const f = await keySessionFixture(cleanups);
    const filePath = path.join(f.root, "concurrently-created.sqlite");
    const stores: KeyStore[] = Array.from({ length: 8 }, () => createSQLiteKeyStore({ filePath }));
    try {
      expect(await Promise.all(stores.map((store) => store.getKey(f.key.keyId)))).toEqual(Array(8).fill(null));
    } finally {
      await Promise.all(stores.map((store) => store.close()));
    }
    expect(await readJournalMode(filePath)).toBe("delete");
    const reopened = createSQLiteKeyStore({ filePath });
    try {
      expect(await reopened.getKey(f.key.keyId)).toBeNull();
    } finally {
      await reopened.close();
    }
    expect(await readJournalMode(filePath)).toBe("delete");
  });

  it("reopens keys and sessions, persists proof replay protection, and never writes a raw bearer or private key", async () => {
    const f = await keySessionFixture(cleanups);
    const proof = f.proof();
    const session = await f.service.exchange(proof);
    await f.store.close();
    const reopened = f.openStore();
    const service = f.serviceFor({ store: reopened });
    expect((await reopened.getKey(f.key.keyId))?.userId).toBe(f.binding.userId);
    expect(await service.authenticate(session.sessionToken)).toMatchObject({ principal: { type: "user", id: f.binding.userId, workspaceId: f.binding.workspaceId }, keyId: f.key.keyId });
    await expect(service.exchange(proof)).rejects.toMatchObject({ code: "key.replayed" });
    const digest = createHash("sha256").update(session.sessionToken).digest("hex");
    expect((await reopened.findSession(digest, f.state.nowMs))?.session).toMatchObject({ tokenDigest: digest, audience: "https://app.example.com#instance-1" });
    await reopened.close();
    const bytes = await readFile(f.filePath);
    expect(bytes.includes(Buffer.from(session.sessionToken))).toBe(false);
    expect(bytes.includes(Buffer.from(f.pair.privateKeyPem))).toBe(false);
    expect(bytes.includes(Buffer.from(digest))).toBe(true);
  });

  it.each([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])("atomically rejects simultaneous proof replay across eight independent SQLite connections (round %i)", async () => {
    const f = await keySessionFixture(cleanups);
    const proof = f.proof();
    const services = Array.from({ length: 8 }, () => f.serviceFor({ store: f.openStore() }));
    const outcomes = await Promise.allSettled(services.map((service) => service.exchange(proof)));
    const success = outcomes.filter((outcome) => outcome.status === "fulfilled");
    const failures = outcomes.filter((outcome) => outcome.status === "rejected");
    expect(success).toHaveLength(1);
    expect(failures).toHaveLength(7);
    for (const failure of failures) expect(failure.reason).toMatchObject({ code: "key.replayed" });
  });

  it("rolls back nonce consumption when the session insert fails", async () => {
    const f = await keySessionFixture(cleanups);
    const issue = (nonce: string, token: string): KeySessionIssue => ({
      keyId: f.key.keyId,
      nonceDigest: createHash("sha256").update(nonce).digest("hex"),
      nonceExpiresAtMs: f.state.nowMs + 600_000,
      session: {
        keyId: f.key.keyId,
        audience: "https://app.example.com#instance-1",
        tokenDigest: createHash("sha256").update(token).digest("hex"),
        createdAtMs: f.state.nowMs,
        expiresAtMs: f.state.nowMs + 3_600_000,
        revokedAtMs: null,
        lastUsedAtMs: null
      }
    });
    expect(await f.store.issue(issue("nonce-1", "session-1"))).toBe("issued");
    await expect(f.store.issue(issue("nonce-2", "session-1"))).rejects.toThrow();
    expect(await f.store.issue(issue("nonce-2", "session-2"))).toBe("issued");
    expect(await f.store.issue(issue("nonce-2", "session-3"))).toBe("replayed");
    f.state.nowMs += 599_999;
    expect(await f.store.issue(issue("nonce-2", "session-4"))).toBe("replayed");
    f.state.nowMs += 1;
    expect(await f.store.issue(issue("nonce-2", "session-4"))).toBe("issued");
  });

  it("atomically consumes a shared nonce across eight actual service processes", async () => {
    const f = await keySessionFixture(cleanups);
    const outcomes = await competingStoreProcesses(f.filePath, f.key.keyId, f.state.nowMs);
    expect(outcomes.filter((outcome) => outcome === "issued")).toHaveLength(1);
    expect(outcomes.filter((outcome) => outcome === "replayed")).toHaveLength(7);
    const reopened = f.openStore();
    expect((await reopened.getKey(f.key.keyId))?.keyId).toBe(f.key.keyId);
  });

  it("persists individual session and whole-key revocation without allowing revoked enrollment to reactivate", async () => {
    const f = await keySessionFixture(cleanups);
    const first = await f.service.exchange(f.proof());
    const second = await f.service.exchange(f.proof());
    expect(await f.service.revokeSession(first.sessionToken)).toBe(true);
    await expect(f.service.authenticate(first.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    expect((await f.service.authenticate(second.sessionToken)).keyId).toBe(f.key.keyId);
    expect(await f.service.revokeKey(f.key.keyId)).toBe(true);
    const reopened = f.serviceFor({ store: f.openStore() });
    await expect(reopened.authenticate(second.sessionToken)).rejects.toMatchObject({ code: "key.unauthorized" });
    await expect(reopened.exchange(f.proof())).rejects.toMatchObject({ code: "key.unknown" });
    await expect(reopened.enrollKey({ publicKey: f.pair.publicKeyBase64Url, userId: f.binding.userId, workspaceId: f.binding.workspaceId })).rejects.toMatchObject({ code: "key.bad_enrollment" });
    expect(await reopened.listKeys(f.binding)).toMatchObject([{ keyId: f.key.keyId, revokedAtMs: f.state.nowMs }]);
  });

  it("drains in-flight operations on close and refuses reuse of the closed store", async () => {
    const f = await keySessionFixture(cleanups);
    const reading = f.store.getKey(f.key.keyId);
    await f.store.close();
    expect((await reading)?.keyId).toBe(f.key.keyId);
    await expect(f.store.getKey(f.key.keyId)).rejects.toThrow("closed");
  });
});
