import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { PlannedSecret } from "../../plan/index.ts";
import { ensureSecrets } from "../ensure-secrets.ts";

const roots: string[] = [];
afterEach(() => { for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true }); });

function secretsIn(root: string): PlannedSecret[] {
  return [
    { name: "provisioning_token", file: path.join(root, "s", "provisioning-token"), generate: "token" },
    { name: "setup_code", file: path.join(root, "s", "setup-code"), generate: "setup-code" },
    { name: "secret_keyring", file: path.join(root, "s", "secret-keyring"), generate: "keyring" },
    { name: "stripe_secret_key", file: path.join(root, "s", "stripe-secret-key"), generate: "stripe-mock-key" }
  ];
}

describe("ensureSecrets", () => {
  it("generates each absent secret in the shape Core reads, once", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-secrets-"));
    roots.push(root);
    const secrets = secretsIn(root);
    expect(await ensureSecrets(secrets)).toEqual(secrets.map((secret) => secret.file));
    const [token, code, keyring, stripe] = secrets.map((secret) => readFileSync(secret.file, "utf8"));
    expect(token).toMatch(/^[0-9a-f]{64}\n$/u);
    expect(code).toMatch(/^[0-9a-f]{48}\n$/u);
    expect(stripe).toMatch(/^sk_test_[0-9a-f]{48}\n$/u);
    const ring = JSON.parse(keyring ?? "") as { version: number; currentKeyId: string; keys: Record<string, string> };
    expect(ring.version).toBe(1);
    expect(Buffer.from(ring.keys[ring.currentKeyId] ?? "", "base64")).toHaveLength(32);
    expect(await ensureSecrets(secrets)).toEqual([]);
    expect(readFileSync(secrets[2]?.file ?? "", "utf8")).toBe(keyring);
  });

  it("never generates an operator's secret, and names every missing one before writing anything", async () => {
    const root = mkdtempSync(path.join(os.tmpdir(), "fluxiq-cloud-secrets-"));
    roots.push(root);
    const operator: PlannedSecret[] = [
      { name: "stripe_secret_key", file: path.join(root, "stripe-live-key"), generate: "operator" },
      { name: "email_smtp_password", file: path.join(root, "smtp-password"), generate: "operator" }
    ];
    await expect(ensureSecrets([...secretsIn(root), ...operator])).rejects.toThrow(/must be created by the operator before up:\n {2}- .*stripe-live-key\n {2}- .*smtp-password/u);
    expect(() => readFileSync(secretsIn(root)[0]?.file ?? "")).toThrow();
    writeFileSync(operator[0]?.file ?? "", "sk_live_from_the_operator\n");
    writeFileSync(operator[1]?.file ?? "", "relay\n");
    await ensureSecrets(operator);
    expect(readFileSync(operator[0]?.file ?? "", "utf8")).toBe("sk_live_from_the_operator\n");
  });
});
