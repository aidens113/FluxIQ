// The nodes the state-aware grammar is lowered into, for the authoring tests
// (t388, contract C1, C4).
//
// All three are Core's own built-ins, in every default registry: the handler
// registration and the handler end (`nodes/control-flow/handler.ts`,
// `handler-end.ts`) and Call Subflow (`nodes/control-flow/call-subflow.ts`,
// t392). The tests read them from there, so a plan they assemble is checked
// against the definitions a run executes, never a stand-in.
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition } from "../../../../nodes/index.ts";

/** A registry with Core's built-ins (the three state nodes among them) and the given definitions. */
export function stateNodeRegistryFixture(definitions: readonly AutomationStudioNodeDefinition[]): AutomationStudioNodeRegistry {
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of definitions) registry.register(definition);
  return registry;
}
