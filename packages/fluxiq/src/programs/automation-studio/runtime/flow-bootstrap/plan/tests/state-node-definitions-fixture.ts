// The three nodes the state-aware grammar is lowered into (contract C1, C4),
// as the contract names and shapes them, for the authoring tests (t388).
//
// Their real definitions are another unit's (R1, `nodes/control-flow/`) and
// were written in parallel, so these stand in by name, parameters and ports
// exactly as the contract states them: a Call Subflow with `subflowId`,
// `inputs` and `outputs` and the ports `success` and `failed`; a handler
// registration with `event`, `scope`, `when`, `order`, `completionCheck` and
// `maxRuns` and the one port `body`; and a handler end with `disposition` and
// its arguments. Each is built from the registry's own Merge, so everything a
// definition carries beyond the contract is a real built-in's.
import { AutomationStudioNodeRegistry, type AutomationNodePort, type AutomationStudioNodeDefinition, type AutomationStudioNodeRegistryResolution } from "../../../../nodes/index.ts";
import { AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS } from "../index.ts";

const IN: AutomationNodePort = { id: "in", label: "In", valueType: "any", role: "control" };

/** The three definitions, built over a registry's Merge. */
export function stateNodeDefinitionsFixture(registry: AutomationStudioNodeRegistry, resolution: AutomationStudioNodeRegistryResolution): AutomationStudioNodeDefinition[] {
  const merge = registry.get("builtin.control.merge", resolution);
  if (!merge) throw new Error("the registry offers no Merge to build the state nodes from");
  const node = (id: string, label: string, parameters: AutomationStudioNodeDefinition["parameters"], outputs: AutomationNodePort[]): AutomationStudioNodeDefinition => ({
    ...merge,
    id,
    label,
    description: label,
    inputs: [IN],
    outputs,
    parameters,
    source: { ...merge.source, implementationKey: id } as AutomationStudioNodeDefinition["source"]
  });
  return [
    node(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.callSubflow, "Call Subflow", [
      { id: "subflowId", label: "Subflow", valueType: "string", required: true },
      { id: "inputs", label: "Inputs", valueType: "object", defaultValue: {} },
      { id: "outputs", label: "Outputs", valueType: "object", defaultValue: {} }
    ], [
      { id: "success", label: "Success", valueType: "any", role: "success" },
      { id: "failed", label: "Failed", valueType: "any", role: "failure" }
    ]),
    node(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handler, "Handler", [
      { id: "event", label: "Event", valueType: "string", required: true },
      { id: "scope", label: "Scope", valueType: "object", required: true },
      { id: "when", label: "When", valueType: "array", defaultValue: [] },
      { id: "order", label: "Order", valueType: "number", defaultValue: 1 },
      { id: "completionCheck", label: "Completion check", valueType: "array", defaultValue: [] },
      { id: "maxRuns", label: "Most runs", valueType: "number", defaultValue: 1 }
    ], [{ id: "body", label: "Body", valueType: "any", role: "branch" }]),
    node(AUTOMATION_STUDIO_FLOW_BOOTSTRAP_STATE_NODE_IDS.handlerEnd, "Handler End", [
      { id: "disposition", label: "Then", valueType: "string", required: true },
      { id: "checkpointId", label: "Checkpoint", valueType: "string" },
      { id: "outputs", label: "Outputs", valueType: "object" }
    ], [])
  ];
}

/** A registry with Core's built-ins, the given definitions, and the three state nodes. */
export function stateNodeRegistryFixture(definitions: readonly AutomationStudioNodeDefinition[], resolution: AutomationStudioNodeRegistryResolution): AutomationStudioNodeRegistry {
  const registry = new AutomationStudioNodeRegistry();
  for (const definition of definitions) registry.register(definition);
  for (const definition of stateNodeDefinitionsFixture(registry, resolution)) registry.register(definition);
  return registry;
}
