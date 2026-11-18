// Model setup is independent of the client's connection and authentication.
// This metadata read never calls a provider or restricts deterministic work.

import { readModelKeyAvailability, type ModelKeyAvailability } from "fluxiq/ui";
import type { ChatModelsPort } from "../ports/index.ts";

type UnavailableCode = Extract<ModelKeyAvailability, { state: "unavailable" }>["code"] | "upgrade_required";

/** What the chat knows about a compatible model key, without claiming provider health. */
export type ModelReadiness = "ready" | `unavailable:${UnavailableCode}` | "missing" | "unknown";

/** A failed or malformed read makes no claim about the person's configuration. */
export async function readModelReadiness(models: ChatModelsPort | undefined): Promise<ModelReadiness> {
  if (models === undefined) return "unknown";
  try {
    const result = await models.readKeys();
    if (!result.ok || !Array.isArray(result.value.keys)) return "unknown";
    let unavailable: ModelReadiness | undefined;
    let malformed = false;
    for (const value of result.value.keys) {
      const key = record(value);
      if (key?.heldByYou === false) continue;
      if (!key || typeof key.enabled !== "boolean" || (key.kind !== "llm" && key.kind !== "custom")) {
        malformed = true;
        continue;
      }
      if (key.heldByYou !== undefined && typeof key.heldByYou !== "boolean") {
        malformed = true;
        continue;
      }
      if (!key.enabled || key.kind !== "llm") continue;
      if (key.provider !== undefined && typeof key.provider !== "string") {
        malformed = true;
        continue;
      }
      // Keep the runtime's provider matching: absent defaults to DeepSeek.
      const provider = ((key.provider as string | undefined) ?? "deepseek").toLowerCase().replace(/[^a-z0-9]/gu, "");
      if (provider !== "deepseek" && provider !== "anthropic" && provider !== "anthropicclaude") continue;
      if (key.availability !== undefined) {
        const availability = readModelKeyAvailability(key.availability);
        if (availability === null) malformed = true;
        else if (availability.state === "available") return "ready";
        else unavailable ??= `unavailable:${availability.code}`;
      } else if (key.unlocked === false) {
        unavailable ??= "unavailable:upgrade_required";
      } else if (key.unlocked === undefined || key.unlocked === true) {
        // Older peers without availability metadata retain enabled-key behavior.
        return "ready";
      } else malformed = true;
    }
    return malformed ? "unknown" : unavailable ?? "missing";
  } catch {
    return "unknown";
  }
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}
