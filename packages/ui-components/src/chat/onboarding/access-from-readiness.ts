// The interim adapter from today's `readModelReadiness` to the six model-access states. t924's own mapping
// replaces it; until then a key the reader called unusable reads as "can't open", an old FluxIQ as "update",
// and "unknown" (nothing claimed) as null, so no surface says anything about the key.

import type { ModelAccessState } from "../../model-access/index.ts";
import type { ModelReadiness } from "./model-readiness.ts";

const PROVIDER_NAMES: Readonly<Record<string, string>> = { anthropic: "Anthropic", anthropicclaude: "Anthropic", deepseek: "DeepSeek" };
const UNKNOWN_PROVIDER = "Your AI provider";
const UNKNOWN_KEY = "your key";

/**
 * The state `readiness` stands for; `keys` is the `keys` list the read came from, used only for the provider and
 * name of the first enabled model key. Never claims more than the reader knew.
 */
export function modelAccessFromReadiness(readiness: ModelReadiness, keys?: unknown): ModelAccessState | null {
  const key = firstModelKey(keys);
  switch (readiness) {
    case "ready":
      return { kind: "ready", provider: key.provider, keyName: key.name };
    case "missing":
      return { kind: "no-key" };
    case "unavailable:ciphertext_invalid":
    case "unavailable:host_protection_unavailable":
    case "unavailable:legacy_recovery_required":
      return { kind: "cant-open", keyName: key.name };
    case "unavailable:upgrade_required":
      return { kind: "update-fluxiq" };
    default:
      return null;
  }
}

function firstModelKey(keys: unknown): { provider: string; name: string } {
  if (Array.isArray(keys)) {
    for (const value of keys) {
      if (value === null || typeof value !== "object") continue;
      const key = value as Record<string, unknown>;
      if (key.kind !== "llm" || key.enabled !== true || key.heldByYou === false) continue;
      const id = typeof key.provider === "string" ? key.provider.toLowerCase().replace(/[^a-z0-9]/gu, "") : "deepseek";
      const provider = PROVIDER_NAMES[id] ?? UNKNOWN_PROVIDER;
      const named = [key.name, key.label, key.keyName].find((item): item is string => typeof item === "string" && item.trim() !== "");
      return { provider, name: named?.trim() ?? (provider === UNKNOWN_PROVIDER ? UNKNOWN_KEY : `${provider} key`) };
    }
  }
  return { provider: UNKNOWN_PROVIDER, name: UNKNOWN_KEY };
}
