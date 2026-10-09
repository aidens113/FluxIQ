// The nodes the state-aware grammar is lowered into, for the authoring tests
// (t388, contract C1, C4).
//
// The handler registration and the handler end are Core's own built-ins
// (`nodes/control-flow/handler.ts`, `handler-end.ts`), in every registry, so
// the tests read them from there. `builtin.control.call-subflow` is not defined
// yet (R1-call-subflow), so it stands in here, by the id and the parameters C1
// gives it -- `subflowId`, `inputs` and `outputs` -- and the ports `success`
// and `failed`. It is built from the registry's own Merge, so everything else a
// definition carries is a real built-in's. Delete it once the real node lands.
import { AutomationStudioNodeRegistry, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../index.ts";

/** The Call Subflow node as C1 states it, built over a registry's Merge. */
export function callSubflowDefinitionFixture(registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioNodeDefinition {
  const merge = registry.get("builtin.control.merge", resolution);
  if (!merge) throw new Error("the registry offers no Merge to build Call Subflow from");
  const id = AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow;
  return {
    ...merge,
    id,
    label: "Call Subflow",
    description: "Run another part of this automation and wait for it.",
    inputs: [{ id: "in", label: "In", valueType: "any", role: "control" }],
    outputs: [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" }
    ],
    parameters: [
      { id: "subflowId", label: "Subflow", valueType: "string", required: true },
      { id: "inputs", label: "Inputs", valueType: "json", defaultValue: {} },
      { id: "outputs", label: "Outputs", valueType: "json", defaultValue: {} }
    ],
    source: { kind: "builtin", implementationKey: id }
  };
}

/** A registry with Core's built-ins (the handler nodes among them), the given definitions, and Call Subflow. */
export function stateNodeRegistryFixture(definitions: readonly AutomationStudioNodeDefinition[], resolution: AutomationStudioNodeRegistryResolution): AutomationStudioNodeRegistry {
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of definitions) registry.register(definition);
  registry.register(callSubflowDefinitionFixture(registry, resolution));
  return registry;
}
