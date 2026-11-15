// @fluxiq-test-group real-sql
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../../../database-manager/index.ts";
import { SecretKeysService } from "../../service.ts";
import type { SecretKeyCredentialUnlockRecord } from "../../../types.ts";
import { secretKeySessionDigest, type SecretKeyLockedCredentialHolder } from "../index.ts";

describe("strict enrollment over a durable repository", () => {
  it("reopens exact zero-box locked authority and refuses a reopened conflicting owner or credential", async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), "fluxiq-strict-custody-"));
    const credential = "synthetic-unpublished-durable-credential";
    const session = "synthetic-approving-cookie";
    const holder: SecretKeyLockedCredentialHolder = { holderKind: "paired-client", holderId: "paired-client:durable-test", userId: "user.synthetic", approvingSessionDigest: secretKeySessionDigest(session), expiresAtMs: 2_000_000 };
    const repository = new SQLiteRepository({ rootDir: directory, kind: SecretKeysService.credentialUnlockStoreKind, secureDelete: true });
    const first = new SecretKeysService({ credentialUnlockRepository: repository, now: () => 1_000_000 });
    const reopened = new SecretKeysService({ credentialUnlockRepository: new SQLiteRepository({ rootDir: directory, kind: SecretKeysService.credentialUnlockStoreKind, secureDelete: true }), now: () => 1_000_000 });
    try {
      await first.credentialUnlocks.enrollLockedCredential(holder, credential);
      expect(first.activeSessionUnlockCount()).toBe(0);
      first.close();
      const stored = await repository.get(holder.holderId, {});
      expect(stored?.data).toMatchObject({ userId: holder.userId, approvingSessionDigest: holder.approvingSessionDigest, expiresAtMs: holder.expiresAtMs, boxes: {}, lockReason: "first_unlock" });
      expect((stored?.data as unknown as SecretKeyCredentialUnlockRecord).pending).toBeUndefined();
      await expect(reopened.credentialUnlocks.enrollLockedCredential({ ...holder, userId: "user.someone-else" }, credential)).rejects.toThrow("requires a fresh holder");
      await expect(reopened.credentialUnlocks.enrollLockedCredential(holder, "another-credential")).rejects.toThrow("requires a fresh holder");
      await expect(reopened.credentialUnlocks.presentCredential(holder, credential, { verified: true })).resolves.toEqual({ unlockedKeyCount: 0 });
      const bytes = await readFile(path.join(directory, "global.sqlite"));
      expect(bytes.includes(Buffer.from(credential))).toBe(false);
      expect(bytes.includes(Buffer.from(session))).toBe(false);
    } finally {
      first.close();
      reopened.close();
      if (path.dirname(path.resolve(directory)) !== path.resolve(os.tmpdir()) || !path.basename(directory).startsWith("fluxiq-strict-custody-")) throw new Error("Invalid synthetic test cleanup target.");
      await rm(directory, { recursive: true, force: true });
    }
  });
});
