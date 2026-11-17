import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createHostSecretKeyProtection } from "../host-protection.ts";
import { parseSecretKeyHostKeyring } from "../parse.ts";

const roots: string[] = [];
const context = { storeId: "tenant-one", ownerUserId: "owner", recordId: "key-one", sealDigest: "a".repeat(64) };
function root() {
  const directory = mkdtempSync(path.join(tmpdir(), "fluxiq-host-custody-"));
  roots.push(directory);
  return directory;
}
afterEach(() => { for (const directory of roots.splice(0)) rmSync(directory, { recursive: true, force: true }); });

describe("persistent host key custody", () => {
  it("automatically initializes local custody and opens it after constructing a new host", async () => {
    const rootDir = root();
    const dataKey = Buffer.alloc(32, 17);
    const sealed = await createHostSecretKeyProtection({ profile: "local", rootDir }).seal({ context, dataKey });
    const reopened = createHostSecretKeyProtection({ profile: "local", rootDir });
    expect(await reopened.open({ context, sealed })).toEqual(dataKey);
    await expect(reopened.open({ context: { ...context, storeId: "other-tenant" }, sealed })).rejects.toThrow();
    const file = path.join(rootDir, "host-secrets", process.platform === "win32" ? "keyring.dpapi" : "keyring.json");
    if (process.platform === "win32") expect(readFileSync(file).toString()).not.toContain('"keys"');
    rmSync(file);
    await expect(createHostSecretKeyProtection({ profile: "local", rootDir }).seal({ context, dataKey })).rejects.toThrow("unavailable");
  });
  it("requires explicit production custody and supports current/retained wrapping keys", async () => {
    await expect(createHostSecretKeyProtection({ profile: "service" }).seal({ context, dataKey: Buffer.alloc(32) })).rejects.toThrow("unavailable");
    const keyringFile = path.join(root(), "mounted-secret.json");
    const keys = { old: Buffer.alloc(32, 1).toString("base64"), next: Buffer.alloc(32, 2).toString("base64") };
    writeFileSync(keyringFile, JSON.stringify({ version: 1, currentKeyId: "old", keys }), { mode: 0o600 });
    const protector = createHostSecretKeyProtection({ profile: "service", keyringFile });
    const dataKey = Buffer.alloc(32, 3);
    const old = await protector.seal({ context, dataKey });
    writeFileSync(keyringFile, JSON.stringify({ version: 1, currentKeyId: "next", keys }));
    expect((await protector.seal({ context, dataKey })).keyId).toBe("next");
    expect(await protector.open({ context, sealed: old })).toEqual(dataKey);
    writeFileSync(keyringFile, JSON.stringify({ version: 1, currentKeyId: "next", keys: { next: keys.next } }));
    await expect(protector.open({ context, sealed: old })).rejects.toThrow("unavailable");
  });
  it("rejects malformed keyring material without leaking it in errors", () => {
    expect(() => parseSecretKeyHostKeyring('{"private-fixture-value":')).toThrow("Invalid host keyring.");
    for (const value of [null, {}, { version: 1, currentKeyId: "absent", keys: {} }, { version: 1, currentKeyId: "key", keys: { key: "private-invalid-material" } }]) {
      expect(() => parseSecretKeyHostKeyring(JSON.stringify(value))).toThrow(/Invalid/);
    }
  });
});
