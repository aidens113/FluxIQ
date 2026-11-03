import type { FlowDefinition } from "./contracts.ts";
/** Marks a JSON-compatible declaration without executing user code. */
export function defineFlow<TDefinition extends FlowDefinition>(definition: TDefinition): TDefinition {
  return structuredClone(definition);
}
