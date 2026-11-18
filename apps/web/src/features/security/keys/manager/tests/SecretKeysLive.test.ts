import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SecretKeySummary } from "fluxiq/secret-keys";
import { canSubmitAuth, filterSecretKeys } from "../SecretKeysLive";

const keys: SecretKeySummary[] = [
  { id: "site", name: "Shop login", kind: "custom", provider: "Example Shop", scope: "flow", scopeRef: "billing", description: "", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2 },
  { id: "custom", name: "Warehouse key", kind: "custom", provider: "Internal", scope: "global", description: "", enabled: false, createdAtMs: 1, updatedAtMs: 3, lastRotatedAtMs: 3 }
];
const source = () => readFileSync(new URL("../SecretKeysLive.tsx", import.meta.url), "utf8");
const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//gu, "").replace(/(^|[^:])\/\/.*$/gmu, "$1");

describe("SecretKeysLive view model", () => {
  it("combines search and status filters over friendly details, including where it is used", () => {
    expect(filterSecretKeys(keys, "billing", "enabled").map((key) => key.id)).toEqual(["site"]);
    expect(filterSecretKeys(keys, "warehouse", "disabled").map((key) => key.id)).toEqual(["custom"]);
    expect(filterSecretKeys(keys, "everywhere", "all").map((key) => key.id)).toEqual(["custom"]);
    expect(filterSecretKeys(keys, "billing", "disabled")).toEqual([]);
  });

  it("loads real Domain and per-project Flow scope options lazily", () => {
    const catalog = readFileSync(new URL("../scope-catalog/useSecretScopeCatalog.ts", import.meta.url), "utf8");
    expect(catalog).toContain('fetch("/api/programs"');
    expect(catalog).toContain('api.get<{ projects:');
    expect(catalog).toContain('"list-flow-summaries", { projectId }');
    expect(source()).toContain('label="Project"');
  });

  it("asks only for the password to add something, and adds the two-step code only where it is turned on", () => {
    const user = { id: "admin", username: "admin", displayName: "Admin", roleId: "admin", permissions: [], pinConfigured: undefined, totpEnabled: true };
    const auth = { password: "password", totp: "" };
    expect(canSubmitAuth(auth, user, false)).toBe(true);
    expect(canSubmitAuth(auth, user)).toBe(false);
    expect(canSubmitAuth({ ...auth, totp: "123456" }, user)).toBe(true);
  });

  it("routes create, update, replace and remove through the operation gate, and has no reveal", () => {
    const text = source();
    expect(text).toContain("operation.run(name");
    for (const operation of ["create-key", "update-key", "rotate-key", "delete-key"]) expect(text).toContain(`mutate("${operation}"`);
    expect(text).not.toContain("reveal-key");
  });

  it("offers no AI key type, no PIN and none of the old wording to a person", () => {
    const text = withoutComments(source());
    expect(text).not.toMatch(/\bPIN\b|pinConfigured|authorizationPin/u);
    expect(text).not.toContain('value="llm"');
    expect(text).not.toMatch(/Reveal (for|temporarily|secret)|Rotate (value|secret)|Authorize|Scope reference|Secret Key|credential|encrypted/iu);
  });
});
