import {
  automationNodeClassGroups,
  getAutomationNodeDefinitions,
  type AutomationNodeDefinition
} from "fluxiq/automation-studio/nodes";
import type { AutomationEditorNodeSpec, AutomationEditorPaletteGroup } from "./node-types";

export const automationEditorPalette: AutomationEditorPaletteGroup[] = automationNodeClassGroups
  .map((group) => ({
    title: group.label,
    nodes: getAutomationNodeDefinitions()
      .filter((node) => node.class === group.id)
      .map(automationNodeDefinitionToEditorSpec)
  }))
  .filter((group) => group.nodes.length > 0);

function automationNodeDefinitionToEditorSpec(definition: AutomationNodeDefinition): AutomationEditorNodeSpec {
  return {
    id: definition.id,
    version: "1.0.0",
    label: definition.label,
    description: definition.description,
    family: definition.class,
    scope: definition.scope,
    nodeType: definition.origin === "custom" ? "custom" : "base",
    inputs: definition.inputs,
    outputs: definition.outputs,
    parameters: definition.parameters,
    ...(definition.icon !== undefined ? { icon: definition.icon } : {}),
    ...(definition.privileged !== undefined ? { privileged: definition.privileged } : {}),
    ...(definition.class === "policy" && definition.id === "builtin.policy.action" ? { actionTypes: ["action"] } : {})
  };
}
