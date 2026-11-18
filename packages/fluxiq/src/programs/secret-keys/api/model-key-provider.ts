import type { SaveModelKeyProvider } from "./contracts.ts";

type ModelKeyFields = { kind: string; enabled: boolean; provider?: string | undefined };

/**
 * The provider a model call with this key would reach, read as the host reads a
 * key's provider when it picks one for a call (an enabled `llm` key naming
 * Anthropic or DeepSeek; a key naming none is DeepSeek's); undefined for any
 * other key, which no free check can test.
 */
export function secretKeyModelProvider(key: ModelKeyFields): SaveModelKeyProvider | undefined {
  if (key.kind !== "llm" || !key.enabled) return undefined;
  const provider = (key.provider ?? "deepseek").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (provider === "anthropic" || provider === "anthropicclaude") return "anthropic";
  return provider === "deepseek" ? "deepseek" : undefined;
}
