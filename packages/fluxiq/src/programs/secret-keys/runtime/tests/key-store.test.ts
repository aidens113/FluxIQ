import { describe, expect, it } from "vitest";
import type { Repository } from "../../../database-manager/index.ts";
import type { EncryptedSecretValueRecordV2 } from "../../types.ts";
import { SecretKeyStore } from "../key-store.ts";
import { SecretValueSealer } from "../value-sealer.ts";
import { WEAK_SCRYPT_PARAMETERS, createMemoryRepository, legacyV1Record } from "./secret-key-fixtures.ts";

const PASSWORD = "dummy-password";
const sealer = new SecretValueSealer({ testOnlyWeakParameters: WEAK_SCRYPT_PARAMETERS });

function storedKey(id: string) {
  return legacyV1Record({ id, value: "stored-value", password: PASSWORD });
}

async function versionTwoSeal(sealedByUserId?: string): Promise<EncryptedSecretValueRecordV2> {
  const { sealed, key } = await sealer.seal({ id: "secret:any", value: "stored-value", updatedAtMs: 1000 }, PASSWORD, sealedByUserId);
  key.fill(0);
  return sealed;
}

describe("SecretKeyStore", () => {
  it("retries a failed first read at the next load", async () => {
    const record = storedKey("secret:stored");
    const memory = createMemoryRepository([record]);
    let failNext = true;
    const repository: Repository = {
      ...memory.repository,
      list: async (scope) => {
        if (failNext) {
          failNext = false;
          throw new Error("dummy read failure");
        }
        return memory.repository.list(scope);
      }
    };
    const store = new SecretKeyStore({ repository, kind: "secret.keys", sealer });

    await expect(store.load()).rejects.toThrow("dummy read failure");
    await expect(store.load()).resolves.toBeUndefined();
    expect(store.get(record.id)?.id).toBe(record.id);
  });

  it("skips a queued write for a record deleted before the write runs, and deletes after the writes ahead of it", async () => {
    const record = storedKey("secret:stored");
    const memory = createMemoryRepository([record]);
    const store = new SecretKeyStore({ repository: memory.repository, kind: "secret.keys", sealer });
    await store.load();
    const holding = memory.holdNextPut();

    const firstWrite = store.persist(record.id);
    await holding.started;
    const secondWrite = store.persist(record.id);
    const deleting = store.delete(record.id);
    holding.release();
    await firstWrite;
    await secondWrite;

    await expect(deleting).resolves.toBe(true);
    expect(memory.putCount()).toBe(1);
    expect(memory.stored(record.id)).toBeUndefined();
  });

  it("offers a user version 1, unstamped, and their own version 2 records, but not another user's", async () => {
    const records = [
      storedKey("secret:v1"),
      { ...storedKey("secret:mine"), sealed: await versionTwoSeal("user.one") },
      { ...storedKey("secret:theirs"), sealed: await versionTwoSeal("user.two") },
      { ...storedKey("secret:unstamped"), sealed: await versionTwoSeal() }
    ];
    const store = new SecretKeyStore({ repository: createMemoryRepository(records).repository, kind: "secret.keys", sealer });
    await store.load();

    expect(store.sealedFor("user.one").map((record) => record.id).sort()).toEqual(["secret:mine", "secret:unstamped", "secret:v1"]);
  });
});
