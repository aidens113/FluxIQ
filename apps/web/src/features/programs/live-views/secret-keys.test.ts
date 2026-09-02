import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SecretKeySummary } from "fluxiq/secret-keys";
import { canSubmitAuth, filterSecretKeys, providerRuntimeSupport, secretRevealIsStale } from "./secret-keys";

const keys: SecretKeySummary[] = [
  { id: "openai", name: "Primary model", kind: "llm", provider: "OpenAI", scope: "flow", scopeRef: "billing", description: "", enabled: true, createdAtMs: 1, updatedAtMs: 2, lastRotatedAtMs: 2, metadata: { model: "gpt-5" } },
  { id: "custom", name: "Warehouse token", kind: "custom", provider: "Internal", scope: "global", description: "", enabled: false, createdAtMs: 1, updatedAtMs: 3, lastRotatedAtMs: 3 }
];

describe("SecretKeysLive view model", () => {
  it("combines search, type, and status filters over friendly metadata", () => {
    expect(filterSecretKeys(keys, "gpt-5", "llm", "enabled").map((key) => key.id)).toEqual(["openai"]);
    expect(filterSecretKeys(keys, "warehouse", "custom", "disabled").map((key) => key.id)).toEqual(["custom"]);
    expect(filterSecretKeys(keys, "billing", "custom", "all")).toEqual([]);
  });

  it("distinguishes built-in, local, and host-required providers", () => {
    expect(providerRuntimeSupport("DeepSeek").label).toBe("Built-in provider");
    expect(providerRuntimeSupport("Ollama").label).toBe("Local provider");
    expect(providerRuntimeSupport("Private LLM").label).toBe("Custom adapter required");
  });

  it("invalidates reveals when a key changes or disappears", () => {
    expect(secretRevealIsStale(keys[0]!, keys[0])).toBe(false);
    expect(secretRevealIsStale(keys[0]!, { ...keys[0]!, lastRotatedAtMs: 4 })).toBe(true);
    expect(secretRevealIsStale(keys[0]!, undefined)).toBe(true);
  });

  it("loads real Domain and per-project Flow scope options lazily", () => {
    const source = readFileSync(new URL("./secret-keys.tsx", import.meta.url), "utf8");
    expect(source).toContain('fetch("/api/programs"');
    expect(source).toContain('automationApi.get<{ projects:');
    expect(source).toContain('"list-flow-summaries", { projectId }');
    expect(source).toContain('label="Project"');
  });

  it("does not require 2FA when authorizing creation", () => {
    const user = { id: "admin", username: "admin", displayName: "Admin", roleId: "admin", permissions: [], pinConfigured: true, totpEnabled: true };
    const auth = { password: "password", pin: "1234", totp: "" };
    expect(canSubmitAuth(auth, user, false)).toBe(true);
    expect(canSubmitAuth(auth, user)).toBe(false);
  });

  it("routes create, update, rotate, reveal, and delete through the operation gate", () => {
    const source = readFileSync(new URL("./secret-keys.tsx", import.meta.url), "utf8");
    for (const operation of ["create-key", "update-key", "rotate-key", "reveal-key", "delete-key"]) {
      expect(source).toContain(`operation.run("${operation}"`);
    }
  });
});
