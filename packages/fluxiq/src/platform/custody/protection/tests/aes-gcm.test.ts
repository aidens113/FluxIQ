import { describe, expect, it } from "vitest";
import { AesGcmSecretKeyHostProtection, SecretKeyProtectionUnavailableError, type SecretKeyProtectionContext } from "../index.ts";

const context: SecretKeyProtectionContext = { storeId: "tenant.one", ownerUserId: "alice", recordId: "key.one", sealDigest: "a".repeat(64) };

describe("host data-key protection", () => {
  it("opens with a fresh adapter and retained key id without changing its resolver's key", async () => {
    const master = Buffer.alloc(32, 7);
    const resolve = () => ({ keyId: "master.one", key: master });
    const key = Buffer.alloc(32, 21);
    const sealed = await new AesGcmSecretKeyHostProtection(resolve).seal({ context, dataKey: key });
    const opened = await new AesGcmSecretKeyHostProtection(resolve).open({ context, sealed });
    expect(opened).toEqual(key);
    expect(master).toEqual(Buffer.alloc(32, 7));
    opened.fill(0);
  });

  it.each(["storeId", "ownerUserId", "recordId", "sealDigest"] as const)("authenticates %s", async (field) => {
    const protector = new AesGcmSecretKeyHostProtection(() => ({ keyId: "one", key: Buffer.alloc(32, 4) }));
    const sealed = await protector.seal({ context, dataKey: Buffer.alloc(32, 9) });
    const changed = { ...context, [field]: field === "sealDigest" ? "b".repeat(64) : "other" };
    await expect(protector.open({ context: changed, sealed })).rejects.toThrow("authentication failed");
  });

  it("distinguishes unavailable host keys from malformed or modified ciphertext", async () => {
    const protector = new AesGcmSecretKeyHostProtection(() => ({ keyId: "one", key: Buffer.alloc(32, 4) }));
    const sealed = await protector.seal({ context, dataKey: Buffer.alloc(32, 9) });
    await expect(new AesGcmSecretKeyHostProtection(() => undefined).open({ context, sealed })).rejects.toBeInstanceOf(SecretKeyProtectionUnavailableError);
    await expect(protector.open({ context, sealed: { ...sealed, iv: "bad" } })).rejects.toThrow("Invalid");
    await expect(protector.open({ context, sealed: { ...sealed, ciphertext: Buffer.alloc(32, 1).toString("base64url") } })).rejects.toThrow("authentication failed");
  });

  it("keeps retired wrapping ids readable while a new id is current", async () => {
    const keys = new Map([["one", Buffer.alloc(32, 1)], ["two", Buffer.alloc(32, 2)]]);
    let current = "one";
    const protector = new AesGcmSecretKeyHostProtection(({ keyId = current }) => keys.has(keyId) ? { keyId, key: keys.get(keyId)! } : undefined);
    const sealed = await protector.seal({ context, dataKey: Buffer.alloc(32, 7) });
    current = "two";
    const opened = await protector.open({ context, sealed });
    expect(opened).toEqual(Buffer.alloc(32, 7));
    opened.fill(0);
    expect((await protector.seal({ context, dataKey: Buffer.alloc(32, 7) })).keyId).toBe("two");
    keys.delete("one");
    await expect(protector.open({ context, sealed })).rejects.toBeInstanceOf(SecretKeyProtectionUnavailableError);
  });
});
