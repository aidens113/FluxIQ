import { AUTOMATION_STUDIO_ANTHROPIC_MODELS, AUTOMATION_STUDIO_DEEPSEEK_MODELS } from "fluxiq/automation/llm-models";

/** The models Core runs for a key's provider, as its registry lists them; none for a provider the engine does not run. */
export function modelsOfProvider(provider: string | undefined): readonly string[] {
  const normalized = (provider ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
  if (normalized === "anthropic" || normalized === "anthropicclaude") return AUTOMATION_STUDIO_ANTHROPIC_MODELS;
  if (normalized === "deepseek") return AUTOMATION_STUDIO_DEEPSEEK_MODELS;
  return [];
}
