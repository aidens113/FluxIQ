import { describe, expect, it } from "vitest";
import { AutomationStudioAesGcmProjectContentProtection } from "../project-content-protection.ts";

describe("AutomationStudioAesGcmProjectContentProtection", () => {
  it("round trips without disclosing plaintext or key material in its envelope", async () => {
    const key = Buffer.alloc(32, 7);
    const protection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "key.1", key }));
    const sealed = await protection.seal({ projectId: "project.one", mediaType: "application/json", content: Buffer.from("sensitive context") });
    expect(sealed.content.toString("utf8")).not.toContain("sensitive context");
    expect(sealed.encryption).not.toContain(key.toString("base64"));
    expect(JSON.parse(sealed.encryption)).toMatchObject({ version: 1, providerId: protection.providerId, keyId: "key.1" });
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", ...sealed })).resolves.toEqual(Buffer.from("sensitive context"));
  });

  it("authenticates ciphertext, project, media type, and metadata", async () => {
    const protection = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "key.1", key: Buffer.alloc(32, 8) }));
    const sealed = await protection.seal({ projectId: "project.one", mediaType: "application/json", content: Buffer.from("context") });
    const tampered = Buffer.from(sealed.content); tampered[0] = (tampered[0] ?? 0) ^ 1;
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", content: tampered, encryption: sealed.encryption })).rejects.toThrow("authentication failed");
    await expect(protection.open({ projectId: "project.two", mediaType: "application/json", ...sealed })).rejects.toThrow("authentication failed");
    await expect(protection.open({ projectId: "project.one", mediaType: "text/plain", ...sealed })).rejects.toThrow("authentication failed");
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", content: sealed.content, encryption: sealed.encryption.replace("aes-256-gcm", "unknown") })).rejects.toThrow("metadata is invalid");
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", content: sealed.content, encryption: '{"version":1}' })).rejects.toThrow("metadata is invalid");
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", content: sealed.content, encryption: JSON.stringify({ ...JSON.parse(sealed.encryption), extra: true }) })).rejects.toThrow("metadata is invalid");
  });

  it("supports host-owned rotation and fails closed after key retirement", async () => {
    const keys = new Map([["key.1", Buffer.alloc(32, 1)], ["key.2", Buffer.alloc(32, 2)]]);
    let current = "key.1";
    const protection = new AutomationStudioAesGcmProjectContentProtection(({ keyId }) => {
      const selected = keyId ?? current;
      const key = keys.get(selected);
      return key ? { keyId: selected, key } : undefined;
    });
    const old = await protection.seal({ projectId: "project.one", mediaType: "application/json", content: Buffer.from("old") });
    current = "key.2";
    const fresh = await protection.seal({ projectId: "project.one", mediaType: "application/json", content: Buffer.from("fresh") });
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", ...old })).resolves.toEqual(Buffer.from("old"));
    expect(JSON.parse(fresh.encryption).keyId).toBe("key.2");
    keys.delete("key.1");
    await expect(protection.open({ projectId: "project.one", mediaType: "application/json", ...old })).rejects.toThrow("key is unavailable");
  });

  it("rejects unavailable and incorrectly sized keys", async () => {
    const missing = new AutomationStudioAesGcmProjectContentProtection(() => undefined);
    await expect(missing.seal({ projectId: "project.one", mediaType: "text/plain", content: Buffer.from("x") })).rejects.toThrow("key is unavailable");
    const short = new AutomationStudioAesGcmProjectContentProtection(() => ({ keyId: "key.1", key: Buffer.alloc(31) }));
    await expect(short.seal({ projectId: "project.one", mediaType: "text/plain", content: Buffer.from("x") })).rejects.toThrow("exact 256-bit key");
  });
});
