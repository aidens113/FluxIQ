import type { JsonObject } from "../../../../../core/index.ts";
import { automationStudioLlmEvidenceCanonicalJson } from "../evidence-loop-decision.ts";
import { automationStudioLlmRunNodesEffectiveInput, automationStudioLlmRunNodesFreeze, automationStudioLlmRunNodesJsonObject } from "./prior-call.ts";
import type { AutomationStudioLlmRunNodesIdentity, AutomationStudioLlmRunNodesOriginal } from "./types.ts";

/** INTERNAL list identity includes resolved params and effective inputs; excludes call ids, aliases and model noise. */
export function automationStudioLlmRunNodesIdentity(originals: readonly AutomationStudioLlmRunNodesOriginal[], world: JsonObject): AutomationStudioLlmRunNodesIdentity {
  if (!automationStudioLlmRunNodesJsonObject(world)) throw new Error("Batch world authority is not readable JSON.");
  const input: JsonObject = {
    world: structuredClone(world),
    calls: originals.map((original) => ({
      definitionId: original.definitionId,
      definitionVersion: original.definitionVersion,
      authorityKey: original.authorityKey,
      input: automationStudioLlmRunNodesEffectiveInput(original)
    }))
  };
  return automationStudioLlmRunNodesFreeze({ input, key: automationStudioLlmEvidenceCanonicalJson(input) });
}
