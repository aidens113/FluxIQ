import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { SQLiteRepository } from "../../database-manager/index.ts";
import { SecretKeysService } from "./service.ts";

describe("SecretKeysService", () => {
  it("stores encrypted secret values and returns redacted snapshots", async () => {
    const service = new SecretKeysService();

    const key = await service.createKey({
      name: "OpenAI production",
      value: "sk-live-secret",
      authorizationPassword: "admin",
      provider: "OpenAI",
      nowMs: 1000
    });

    expect(key).toMatchObject({ name: "OpenAI production", kind: "llm", provider: "OpenAI", enabled: true });
    expect(JSON.stringify(await service.snapshot())).not.toContain("sk-live-secret");
    await expect(service.revealKey({ id: key.id, authorizationPassword: "wrong" })).rejects.toThrow();
    await expect(service.revealKey({ id: key.id, authorizationPassword: "admin", nowMs: 2000 })).resolves.toMatchObject({
      value: "sk-live-secret",
      key: { lastRevealedAtMs: 2000 }
    });
  });

  it("persists sealed payloads without storing plaintext values", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "fluxiq-secrets-"));
    try {
      const repository = new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind });
      const first = new SecretKeysService({ repository });
      const key = await first.createKey({
        name: "Custom token",
        value: "custom-secret-value",
        authorizationPassword: "admin",
        kind: "custom",
        nowMs: 1000
      });

      const stored = await repository.get(key.id, {});
      expect(stored?.kind).toBe("secret.keys");
      expect(JSON.stringify(stored?.data)).not.toContain("custom-secret-value");
      expect(stored?.data.encrypted).toBe(true);
      expect(stored?.data.sealed).toMatchObject({ algorithm: "aes-256-gcm", kdf: "scrypt" });

      const second = new SecretKeysService({ repository: new SQLiteRepository({ rootDir: root, kind: SecretKeysService.storeKind }) });
      await expect(second.revealKey({ id: key.id, authorizationPassword: "admin" })).resolves.toMatchObject({ value: "custom-secret-value" });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});