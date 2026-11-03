// Compatibility exports; the framework owns this implementation.
export {
  adaptBuiltinAutomationNodeDefinition,
  validateAutomationStudioNodeDefinition,
  validateAutomationStudioImporterNodeManifest
} from "../../../components/automation/index.ts";
export type {
  AutomationStudioNodeAvailability,
  AutomationStudioNodeSource,
  AutomationStudioNodeCapabilities,
  AutomationStudioNodeSafety,
  AutomationStudioNodeRuntimeRequirements,
  AutomationStudioNodeOutputActionContract,
  AutomationStudioNodeEditorHints,
  AutomationStudioNodeDefinition,
  AutomationStudioNodeParameterContract,
  AutomationStudioImporterNodeManifest,
  AutomationStudioNodeRegistryResolution
} from "../../../components/automation/index.ts";
